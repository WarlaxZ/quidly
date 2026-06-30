"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTransaction, deleteTransaction } from "../../../lib/data/transactions";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
export async function addTransactionAction(formData: FormData) {
  const property = await getOrCreateDefaultProperty();
  let amountPence!: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/transactions?error=${encodeURIComponent((e as Error).message)}`);
  }
  await createTransaction({
    propertyId: property.id,
    categoryId: String(formData.get("categoryId")),
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
  });
  revalidatePath("/transactions");
}
export async function deleteTransactionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await deleteTransaction(id);
  revalidatePath("/transactions");
}
