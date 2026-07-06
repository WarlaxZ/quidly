"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createRecurringRule, updateRecurringRule, deleteRecurringRule,
  setRecurringActive, materialiseDue, type RecurringInput,
} from "../../../lib/data/recurring";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import type { IntervalUnit } from "../../../lib/recurring/occurrences";
import { requireSession } from "../../../lib/auth/session";

const UNITS: IntervalUnit[] = ["DAY", "WEEK", "MONTH", "YEAR"];

function parseNullableInt(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

/** Parse + validate the schedule fields. Throws a user-facing message string when invalid. */
function parseRuleInput(formData: FormData): Omit<RecurringInput, "propertyId"> {
  const intervalUnit = String(formData.get("intervalUnit")) as IntervalUnit;
  if (!UNITS.includes(intervalUnit)) throw "Choose a valid frequency.";
  const rawCount = Number(formData.get("intervalCount") ?? 1);
  const intervalCount = Number.isFinite(rawCount) ? Math.max(1, Math.floor(rawCount)) : 1;
  const dayOfWeek = parseNullableInt(formData.get("dayOfWeek"));
  const dayOfMonth = parseNullableInt(formData.get("dayOfMonth"));
  const monthOfYear = parseNullableInt(formData.get("monthOfYear"));
  const amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  if (!(amountPence > 0)) throw "Enter an amount greater than zero.";
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  if (!categoryId) throw "Choose a category.";
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "in" && direction !== "out") throw "Choose whether money is in or out.";
  if (intervalUnit === "WEEK" && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6)) throw "Choose a day of the week.";
  if ((intervalUnit === "MONTH" || intervalUnit === "YEAR") && (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 31)) throw "Choose a day of the month (1–31).";
  if (intervalUnit === "YEAR" && (monthOfYear == null || monthOfYear < 1 || monthOfYear > 12)) throw "Choose a month.";
  const startRaw = String(formData.get("startDate") ?? "");
  if (!startRaw) throw "Choose a start date.";
  const startDate = new Date(startRaw);
  if (Number.isNaN(startDate.getTime())) throw "Choose a valid start date.";
  const endRaw = String(formData.get("endDate") ?? "");
  let endDate: Date | null = null;
  if (endRaw) {
    endDate = new Date(endRaw);
    if (Number.isNaN(endDate.getTime())) throw "Choose a valid end date.";
  }
  return {
    categoryId,
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "").trim() || null,
    amountPence,
    direction: direction as Direction,
    intervalUnit,
    intervalCount,
    dayOfWeek: intervalUnit === "WEEK" ? dayOfWeek : null,
    dayOfMonth: intervalUnit === "MONTH" || intervalUnit === "YEAR" ? dayOfMonth : null,
    monthOfYear: intervalUnit === "YEAR" ? monthOfYear : null,
    startDate,
    endDate,
  };
}

export async function addRecurringAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/recurring?error=${encodeURIComponent("Choose a property.")}`);
  try {
    const input = parseRuleInput(formData);
    await createRecurringRule({ propertyId, ...input });
  } catch (e) {
    redirect(`/recurring?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent("Rule added")}`);
}

export async function updateRecurringAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!id || !propertyId) redirect(`/recurring?error=${encodeURIComponent("Missing rule.")}`);
  try {
    const input = parseRuleInput(formData);
    await updateRecurringRule(id, { propertyId, ...input });
  } catch (e) {
    redirect(`/recurring/${id}/edit?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent("Rule updated")}`);
}

export async function setActiveAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (id) await setRecurringActive(id, active);
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent(active ? "Rule resumed" : "Rule paused")}`);
}

export async function deleteRecurringAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteRecurringRule(id);
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent("Rule deleted")}`);
}

export async function generateNowAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "") || undefined;
  const count = await materialiseDue(new Date(), propertyId);
  revalidatePath("/transactions");
  redirect(`/recurring?ok=${encodeURIComponent(`Generated ${count} transaction(s)`)}`);
}
