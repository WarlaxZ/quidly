import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { UPLOAD_DIR, MAX_UPLOAD_BYTES, ALLOWED_MIME } from "../extraction/config";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export function validateUpload(mimeType: string, sizeBytes: number): void {
  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) {
    throw new Error("Unsupported file type — upload a JPG, PNG, or PDF.");
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large (max 10 MB).");
  }
}

export async function saveUpload(bytes: Buffer, originalName: string, mimeType: string): Promise<{ filePath: string; originalName: string }> {
  validateUpload(mimeType, bytes.length);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const filePath = path.join(UPLOAD_DIR, `${randomUUID()}.${EXT[mimeType]}`);
  await writeFile(filePath, bytes);
  return { filePath, originalName };
}
