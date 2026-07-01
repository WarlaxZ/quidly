"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTransaction, deleteTransaction } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import { requireSession } from "../../../lib/auth/session";
export async function addTransactionAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/transactions?error=${encodeURIComponent("Choose a property.")}`);
  let amountPence!: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/transactions?error=${encodeURIComponent((e as Error).message)}`);
  }
  await createTransaction({
    propertyId,
    categoryId: String(formData.get("categoryId")),
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
  });
  revalidatePath("/transactions");
  redirect("/transactions?ok=Transaction+added");
}
export async function deleteTransactionAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteTransaction(id);
  revalidatePath("/transactions");
  redirect("/transactions?ok=Transaction+deleted");
}
