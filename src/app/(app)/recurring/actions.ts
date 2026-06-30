"use server";
import { revalidatePath } from "next/cache";
import { createRecurringRule, deleteRecurringRule, materialiseDue } from "../../../lib/data/recurring";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import type { RecurFrequency } from "../../../lib/recurring/occurrences";
export async function addRecurringAction(formData: FormData) {
  const property = await getOrCreateDefaultProperty();
  await createRecurringRule({
    propertyId: property.id,
    categoryId: String(formData.get("categoryId")),
    amountPence: parseAmountToPence(String(formData.get("amount") ?? "")),
    direction: String(formData.get("direction")) as Direction,
    frequency: String(formData.get("frequency")) as RecurFrequency,
    dayOfMonth: Number(formData.get("dayOfMonth")),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: String(formData.get("endDate") ?? "") ? new Date(String(formData.get("endDate"))) : null,
  });
  revalidatePath("/recurring");
}
export async function deleteRecurringAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteRecurringRule(id);
  revalidatePath("/recurring");
}
export async function generateNowAction() {
  await materialiseDue(new Date());
  revalidatePath("/recurring");
  revalidatePath("/transactions");
}
