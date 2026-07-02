"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rm } from "node:fs/promises";
import { requireSession } from "../../../lib/auth/session";
import { updateTransaction, type TransactionInput } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import type { Direction } from "../../../lib/tax/types";
import { saveUpload, validateUpload } from "../../../lib/storage/files";
import { createAttachment } from "../../../lib/data/attachments";

export async function updateTransactionAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  let amountPence!: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/transactions/${id}/edit?error=${encodeURIComponent((e as Error).message)}`);
  }

  const data: Partial<TransactionInput> = {
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    categoryId: String(formData.get("categoryId")),
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
  };

  // Attachment: new file replaces; "remove" clears; otherwise leave unchanged.
  const file = formData.get("file");
  const removeAttachment = formData.get("removeAttachment") != null;
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
      data.attachmentId = attachment.id;
    } catch (e) {
      if (savedPath) {
        try {
          await rm(savedPath, { force: true });
        } catch {
          /* best effort */
        }
      }
      redirect(`/transactions/${id}/edit?error=${encodeURIComponent((e as Error).message)}`);
    }
  } else if (removeAttachment) {
    data.attachmentId = null;
  }

  await updateTransaction(id, data);
  revalidatePath("/transactions");
  redirect("/transactions?ok=Transaction+updated");
}
