"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { updateTransaction } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";

export async function updateTransactionAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  let amountPence!: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/transactions/${id}/edit?error=${encodeURIComponent((e as Error).message)}`);
  }
  await updateTransaction(id, {
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    categoryId: String(formData.get("categoryId")),
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
  });
  revalidatePath("/transactions");
  redirect("/transactions?ok=Transaction+updated");
}
