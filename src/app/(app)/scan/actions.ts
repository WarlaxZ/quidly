"use server";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/session";
import { isExtractionEnabled } from "../../../lib/extraction/config";
import { saveUpload, validateUpload } from "../../../lib/storage/files";
import { extractReceipt } from "../../../lib/extraction/extract";
import { listCategories } from "../../../lib/data/categories";
import { createAttachment } from "../../../lib/data/attachments";

export async function uploadReceiptAction(formData: FormData) {
  await requireSession();
  if (!isExtractionEnabled()) redirect(`/scan?error=${encodeURIComponent("Scanning is not configured.")}`);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/scan?error=${encodeURIComponent("Please choose a file.")}`);
  }
  const f = file as File;
  let attachmentId!: string;
  try {
    validateUpload(f.type, f.size);
    const bytes = Buffer.from(await f.arrayBuffer());
    const categories = (await listCategories()).map((c) => ({ id: c.id, name: c.name }));
    const extraction = await extractReceipt(bytes, f.type, categories);
    const saved = await saveUpload(bytes, f.name, f.type);
    const attachment = await createAttachment({ filePath: saved.filePath, originalName: saved.originalName, extractedData: JSON.stringify(extraction) });
    attachmentId = attachment.id;
  } catch (e) {
    // Friendly message; never include secrets (SDK errors don't contain the key).
    redirect(`/scan?error=${encodeURIComponent((e as Error).message || "Couldn't read that receipt.")}`);
  }
  redirect(`/scan/review?attachmentId=${attachmentId}`);
}
