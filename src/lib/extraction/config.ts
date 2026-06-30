export function isExtractionEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getExtractionModel(): string {
  return process.env.EXTRACTION_MODEL ?? "claude-haiku-4-5-20251001";
}

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;
