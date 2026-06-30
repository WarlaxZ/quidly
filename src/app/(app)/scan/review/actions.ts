"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../../lib/auth/session";
import { createTransaction } from "../../../../lib/data/transactions";
import { parseAmountToPence } from "../../../../lib/money/parseAmount";
import type { Direction } from "../../../../lib/tax/types";

export async function confirmScanAction(formData: FormData) {
  await requireSession();
  const attachmentId = String(formData.get("attachmentId")) || null;
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/scan/review?attachmentId=${attachmentId}&error=${encodeURIComponent("Choose a property.")}`);
  let amountPence!: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/scan/review?attachmentId=${attachmentId}&error=${encodeURIComponent((e as Error).message)}`);
  }
  await createTransaction({
    propertyId,
    categoryId: String(formData.get("categoryId")),
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
    attachmentId,
    source: "imported",
  });
  revalidatePath("/transactions");
  redirect("/transactions");
}
