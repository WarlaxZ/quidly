"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createRecurringRule, deleteRecurringRule, materialiseDue } from "../../../lib/data/recurring";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import type { RecurFrequency } from "../../../lib/recurring/occurrences";
import { requireSession } from "../../../lib/auth/session";
export async function addRecurringAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/recurring?error=${encodeURIComponent("Choose a property.")}`);
  await createRecurringRule({
    propertyId,
    categoryId: String(formData.get("categoryId")),
    amountPence: parseAmountToPence(String(formData.get("amount") ?? "")),
    direction: String(formData.get("direction")) as Direction,
    frequency: String(formData.get("frequency")) as RecurFrequency,
    dayOfMonth: Number(formData.get("dayOfMonth")),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: String(formData.get("endDate") ?? "") ? new Date(String(formData.get("endDate"))) : null,
  });
  revalidatePath("/recurring");
  redirect(`/recurring?ok=${encodeURIComponent("Rule added")}`);
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
