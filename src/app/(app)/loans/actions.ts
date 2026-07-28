"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createLoan, updateLoan, deleteLoan, setLoanActive, type LoanInput } from "../../../lib/data/loans";
import {
  generateLoanPayments, setActualInterest, applyYearVariance,
} from "../../../lib/data/loanGeneration";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { IntervalUnit } from "../../../lib/recurring/occurrences";
import type { LoanKind } from "../../../lib/tax/types";
import { requireSession } from "../../../lib/auth/session";

const UNITS: IntervalUnit[] = ["DAY", "WEEK", "MONTH", "YEAR"];
const KINDS: LoanKind[] = ["interestOnly", "repayment"];

function parseNullableInt(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

function parseDate(raw: string, label: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw `Choose a valid ${label}.`;
  return d;
}

/** Percent string ("2.7") to basis points (270). */
function parseRateToBps(raw: string): number {
  const n = Number(String(raw).trim().replace("%", ""));
  if (!Number.isFinite(n) || n < 0) throw "Enter a valid interest rate.";
  return Math.round(n * 100);
}

function parseLoanInput(formData: FormData): Omit<LoanInput, "propertyId"> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw "Give the loan a name.";

  const kind = String(formData.get("kind") ?? "") as LoanKind;
  if (!KINDS.includes(kind)) throw "Choose whether the loan is interest-only or repayment.";

  const openingBalancePence = parseAmountToPence(String(formData.get("openingBalance") ?? ""));
  if (!(openingBalancePence > 0)) throw "Enter the outstanding balance.";

  const annualRateBps = parseRateToBps(String(formData.get("annualRate") ?? ""));

  const scheduledPaymentPence = parseAmountToPence(String(formData.get("scheduledPayment") ?? ""));
  if (!(scheduledPaymentPence > 0)) throw "Enter the payment amount.";

  const intervalUnit = String(formData.get("intervalUnit") ?? "") as IntervalUnit;
  if (!UNITS.includes(intervalUnit)) throw "Choose a valid frequency.";
  const rawCount = Number(formData.get("intervalCount") ?? 1);
  const intervalCount = Number.isFinite(rawCount) ? Math.max(1, Math.floor(rawCount)) : 1;

  const dayOfWeek = parseNullableInt(formData.get("dayOfWeek"));
  const dayOfMonth = parseNullableInt(formData.get("dayOfMonth"));
  const monthOfYear = parseNullableInt(formData.get("monthOfYear"));
  if (intervalUnit === "WEEK" && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6)) {
    throw "Choose a day of the week.";
  }
  if ((intervalUnit === "MONTH" || intervalUnit === "YEAR") && (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31)) {
    throw "Choose a day of the month (1–31).";
  }
  if (intervalUnit === "YEAR" && (monthOfYear == null || monthOfYear < 1 || monthOfYear > 12)) {
    throw "Choose a month.";
  }

  const startRaw = String(formData.get("startDate") ?? "");
  if (!startRaw) throw "Choose a start date.";
  const startDate = parseDate(startRaw, "start date");

  const termRaw = String(formData.get("termEndDate") ?? "");
  const termEndDate = termRaw ? parseDate(termRaw, "term end date") : null;
  if (termEndDate && termEndDate <= startDate) throw "The term end must be after the start date.";

  return {
    name, kind, openingBalancePence, annualRateBps, scheduledPaymentPence,
    intervalUnit, intervalCount,
    dayOfWeek: intervalUnit === "WEEK" ? dayOfWeek : null,
    dayOfMonth: intervalUnit === "MONTH" || intervalUnit === "YEAR" ? dayOfMonth : null,
    monthOfYear: intervalUnit === "YEAR" ? monthOfYear : null,
    startDate, termEndDate,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function addLoanAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/loans?error=${encodeURIComponent("Choose a property.")}`);
  try {
    const input = parseLoanInput(formData);
    await createLoan({ propertyId, ...input });
  } catch (e) {
    redirect(`/loans/new?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/loans");
  redirect(`/loans?ok=${encodeURIComponent("Loan added")}`);
}

export async function updateLoanAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!id || !propertyId) redirect(`/loans?error=${encodeURIComponent("Missing loan.")}`);
  try {
    const input = parseLoanInput(formData);
    await updateLoan(id, { propertyId, ...input });
  } catch (e) {
    redirect(`/loans/${id}/edit?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/loans");
  redirect(`/loans/${id}?ok=${encodeURIComponent("Loan updated")}`);
}

export async function setLoanActiveAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (id) await setLoanActive(id, active);
  revalidatePath("/loans");
  redirect(`/loans?ok=${encodeURIComponent(active ? "Loan resumed" : "Loan paused")}`);
}

export async function deleteLoanAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`/loans?error=${encodeURIComponent("Missing loan.")}`);
  try {
    await deleteLoan(id);
  } catch (e) {
    redirect(`/loans?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/loans");
  redirect(`/loans?ok=${encodeURIComponent("Loan deleted")}`);
}

export async function generateLoanPaymentsAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`/loans?error=${encodeURIComponent("Missing loan.")}`);
  let count = 0;
  try {
    count = await generateLoanPayments(id, new Date());
  } catch (e) {
    redirect(`/loans/${id}?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/transactions");
  revalidatePath(`/loans/${id}`);
  redirect(`/loans/${id}?ok=${encodeURIComponent(`Recorded ${count} payment(s)`)}`);
}

export async function setActualInterestAction(formData: FormData) {
  await requireSession();
  const loanId = String(formData.get("loanId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!loanId || !paymentId) redirect(`/loans?error=${encodeURIComponent("Missing payment.")}`);
  try {
    const pence = parseAmountToPence(String(formData.get("actualInterest") ?? ""));
    await setActualInterest(paymentId, pence);
  } catch (e) {
    redirect(`/loans/${loanId}?error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/transactions");
  revalidatePath(`/loans/${loanId}`);
  redirect(`/loans/${loanId}?ok=${encodeURIComponent("Interest updated")}`);
}

export async function applyYearVarianceAction(formData: FormData) {
  await requireSession();
  const loanId = String(formData.get("loanId") ?? "");
  const taxYear = String(formData.get("taxYear") ?? "");
  if (!loanId || !/^\d{4}-\d{2}$/.test(taxYear)) {
    redirect(`/loans?error=${encodeURIComponent("Missing loan or tax year.")}`);
  }
  try {
    const pence = parseAmountToPence(String(formData.get("statementInterest") ?? ""));
    await applyYearVariance(loanId, taxYear, pence);
  } catch (e) {
    redirect(`/loans/${loanId}/reconcile?ty=${taxYear}&error=${encodeURIComponent(message(e))}`);
  }
  revalidatePath("/transactions");
  revalidatePath(`/loans/${loanId}`);
  redirect(`/loans/${loanId}/reconcile?ty=${taxYear}&ok=${encodeURIComponent("Matched to your statement")}`);
}
