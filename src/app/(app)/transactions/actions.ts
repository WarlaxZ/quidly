"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rm } from "node:fs/promises";
import { createTransaction, deleteTransaction } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import { requireSession } from "../../../lib/auth/session";
import { saveUpload, validateUpload } from "../../../lib/storage/files";
import { createAttachment } from "../../../lib/data/attachments";

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

  // Optional receipt/invoice upload
  let attachmentId: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    let savedPath: string | null = null;
    try {
      validateUpload(file.type, file.size);
      const bytes = Buffer.from(await file.arrayBuffer());
      const saved = await saveUpload(bytes, file.name, file.type);
      savedPath = saved.filePath;
      const attachment = await createAttachment({
        filePath: saved.filePath,
        originalName: saved.originalName,
        extractedData: null,
      });
      attachmentId = attachment.id;
    } catch (e) {
      if (savedPath) {
        try {
          await rm(savedPath, { force: true });
        } catch {
          /* best effort */
        }
      }
      redirect(`/transactions?error=${encodeURIComponent((e as Error).message)}`);
    }
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
