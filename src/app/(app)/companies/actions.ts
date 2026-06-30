"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { createCompany, updateCompany, deleteCompanyIfEmpty } from "../../../lib/data/company";
import { createLedgerEntry, deleteLedgerEntry } from "../../../lib/data/companyLedger";
import { poundsToPence } from "../../../lib/tax/money";

function dayMonth(formData: FormData): { day: number; month: number } {
  return { day: Number(formData.get("accountingYearEndDay")), month: Number(formData.get("accountingYearEndMonth")) };
}

export async function addCompanyAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/companies?error=Name+required");
  const { day, month } = dayMonth(formData);
  if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(month) || month < 1 || month > 12) {
    redirect("/companies?error=" + encodeURIComponent("Enter a valid year-end day (1–31) and month."));
  }
  await createCompany({ name, accountingYearEndDay: day, accountingYearEndMonth: month });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function updateCompanyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  const { day, month } = dayMonth(formData);
  if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(month) || month < 1 || month > 12) {
    redirect("/companies?error=" + encodeURIComponent("Enter a valid year-end day (1–31) and month."));
  }
  await updateCompany(id, { name: String(formData.get("name") ?? "").trim() || "Unnamed", accountingYearEndDay: day, accountingYearEndMonth: month });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function deleteCompanyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  try {
    await deleteCompanyIfEmpty(id);
  } catch (e) {
    redirect(`/companies?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/companies");
  redirect("/companies");
}

const LEDGER_KINDS = ["dividend", "director_loan_in", "director_loan_out"] as const;

export async function addLedgerEntryAction(formData: FormData) {
  await requireSession();
  const companyId = String(formData.get("companyId"));
  const base = `/companies/${companyId}/ledger`;
  const kind = String(formData.get("kind"));
  if (!(LEDGER_KINDS as readonly string[]).includes(kind)) redirect(`${base}?error=${encodeURIComponent("Choose a valid entry type.")}`);
  const dateStr = String(formData.get("date") ?? "");
  const date = new Date(dateStr);
  if (!dateStr || Number.isNaN(date.getTime())) redirect(`${base}?error=${encodeURIComponent("Enter a valid date.")}`);
  const amountPence = poundsToPence(Number(formData.get("amount")));
  if (!Number.isFinite(amountPence) || amountPence <= 0) redirect(`${base}?error=${encodeURIComponent("Enter an amount greater than zero.")}`);
  const note = String(formData.get("note") ?? "").trim() || null;
  await createLedgerEntry({ companyId, date, kind: kind as (typeof LEDGER_KINDS)[number], amountPence, note });
  revalidatePath(base);
  redirect(base);
}

export async function deleteLedgerEntryAction(formData: FormData) {
  await requireSession();
  const companyId = String(formData.get("companyId"));
  await deleteLedgerEntry(String(formData.get("id")), companyId);
  revalidatePath(`/companies/${companyId}/ledger`);
  redirect(`/companies/${companyId}/ledger`);
}
