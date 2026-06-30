# AI Receipt Extraction — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); ready for implementation planning
**Phase:** 2 (AI sub-project)

## Problem & context

The user wants to upload a receipt/invoice and have the app auto-fill a transaction (vendor, date, amount, category) — a high-value, time-saving feature. The app is a single-tenant-per-install, self-hosted Next.js 16 + Prisma v7 product (Phase 1 MVP + auth + polish all merged). The `Attachment` table (`filePath`, `originalName`, `extractedData` JSON, `transactions` relation) and `Transaction.attachmentId` already exist in the schema from Phase 1.

**Decisions made in brainstorming:**
- **Engine:** Claude vision via the operator's own Anthropic API key (BYO key). Best accuracy; cost (~pennies/receipt) is on the operator. If no key is set, the feature is hidden/disabled — no weak free path.
- **Inputs:** images (JPG/PNG) **and** PDF.
- **File handling:** keep & archive the uploaded file (linked to the transaction) — useful for HMRC's 5-year record-keeping.
- **Structured output:** use Anthropic **tool-use** (forced tool call with a fixed JSON schema), not free-text parsing.

Implementation will use the **claude-api skill** (current model IDs; prompt caching of the system prompt + category list).

## Section 1 — Config, gating & engine

- **Env vars:** `ANTHROPIC_API_KEY` (operator's key); `EXTRACTION_MODEL` (default `claude-haiku-4-5-20251001` — cheap, vision-capable; configurable); `UPLOAD_DIR` (default `./uploads`).
- **Gating:** `isExtractionEnabled()` returns `!!process.env.ANTHROPIC_API_KEY`. When false: the "Scan" nav link is hidden and `/scan` renders a "Set ANTHROPIC_API_KEY to enable receipt scanning" message instead of the uploader. The extraction code path is never invoked without a key.
- **Cost note** shown on the scan page: "Scanning uses your Anthropic API key (~a few pence per receipt)."

## Section 2 — File storage & Attachment

- `src/lib/storage/files.ts`:
  - `validateUpload(mimeType, sizeBytes)` (pure): allow `image/jpeg`, `image/png`, `application/pdf`; reject over 10 MB; throws a friendly error otherwise.
  - `saveUpload(bytes, originalName, mimeType)`: writes to `UPLOAD_DIR` under a generated `<cuid>.<ext>` filename; returns `{ filePath, originalName }`. Creates `UPLOAD_DIR` if missing.
- The existing **`Attachment`** row stores `filePath`, `originalName`, and `extractedData` (JSON string of the raw extraction result).
- `src/app/(app)/attachments/[id]/route.ts` (GET, auth-gated): streams the stored file with the correct `Content-Type` so a saved receipt can be viewed later. 404 if missing.
- `UPLOAD_DIR` is gitignored; document mounting it as a Docker volume for persistence.

## Section 3 — Extraction service

- `src/lib/extraction/extract.ts`:
  - `buildExtractionTool(categories)` (pure): returns the Anthropic tool definition — a `record_receipt` tool whose `input_schema` requires `vendorName` (string), `date` (string, ISO `YYYY-MM-DD`), `amount` (number, pounds), `direction` (`"in"|"out"`), `categoryId` (enum of the provided category IDs), `confidence` (`"high"|"medium"|"low"`).
  - `parseExtraction(toolInput, categories)` (pure): validates and normalises the model's tool input → `{ vendorName, isoDate, amountPence, direction, categoryId, confidence }`. Rules: `amountPence` via `poundsToPence` (reject ≤0 → throw a friendly "couldn't read an amount"); `isoDate` must match `YYYY-MM-DD` (else null → user fills it); `categoryId` must be one of the provided IDs (else null); `direction` defaults to `"out"` (receipts are usually expenses) if missing/invalid.
  - `extractReceipt(bytes, mimeType, categories)`: thin wrapper that calls the Anthropic SDK (`@anthropic-ai/sdk`) with the file as an image or PDF document content block, the system prompt + `record_receipt` tool (prompt-cached), `tool_choice` forcing the tool, then returns `parseExtraction(toolUse.input, categories)`. The SDK client is injected/mockable so tests don't hit the network.
- Vendor handling (v1): `matchVendorByName(name)` — case-insensitive exact match against existing vendors; link `vendorId` if found, else leave null and pre-fill the description with the vendor name. No auto-creation.

## Section 4 — Scan → review → confirm flow

- **`/scan` page** (`src/app/(app)/scan/page.tsx`): if extraction disabled, show the "set your key" message. Otherwise a file upload form posting to an upload server action.
- **Upload action** (`uploadReceiptAction`, auth-guarded): reads the `File` from FormData; `validateUpload`; `saveUpload`; `extractReceipt`; creates an `Attachment` with `extractedData`. On success, redirects to `/scan/review?attachmentId=<id>`. On any failure (bad file, API error), redirects back to `/scan?error=<message>`.
- **`/scan/review` page** (`src/app/(app)/scan/review/page.tsx`): loads the `Attachment`, parses its `extractedData`, and renders a **pre-filled, fully editable** transaction form (date, £ amount, direction, category, vendor select, description) with the confidence note and a link to view the uploaded file. Hidden `attachmentId`.
- **Confirm action** (`confirmScanAction`, auth-guarded): re-parses amount via `parseAmountToPence`, creates the `Transaction` (tagged `source: "imported"`, `attachmentId` linked), `revalidatePath("/transactions")`, redirects to `/transactions`.
- Nothing is auto-created; the user always confirms. All error paths produce friendly banners, never a 500.

## Section 5 — Testing

- **Pure/unit (Vitest):** `parseExtraction` (valid input; missing/garbage fields; categoryId not in set → null; amount ≤0 → throw; bad date → null; direction default); `buildExtractionTool` (schema contains the category-id enum); `validateUpload` (type allow/reject, size cap).
- **Integration (test DB + tmp dir):** `saveUpload` writes a file and it reads back; `matchVendorByName`; Attachment creation; confirm creating a transaction with `attachmentId`.
- **Mocked SDK:** `extractReceipt` tested with an injected fake Anthropic client returning a canned tool-use response → asserts it flows through `parseExtraction`. No network in tests.
- **Live-run caveat:** the *real* Claude call requires a working `ANTHROPIC_API_KEY`. The automated live-run will verify gating, upload, storage, the review form, and confirm using a stubbed extractor; the genuine end-to-end extraction must be verified by the operator with their key. A short "how to test with your key" note will be added to the README.

## New dependency

- `@anthropic-ai/sdk`.

## Non-goals (explicit)

- No auto-creation of transactions (always review/confirm).
- No auto-creation of vendors (match-or-leave-blank in v1).
- No multi-receipt/batch upload, no background queue, no OCR fallback (BYO-key only).
- No fine-tuning, no storage of API responses beyond the per-attachment `extractedData`.
- No spend metering/limits in-app (the operator manages their Anthropic usage).

## Risks & caveats

- **Cost is the operator's** (their key); the UI states this. No in-app budget guard (documented non-goal).
- **Extraction is best-effort:** the review step is mandatory; low confidence or missing fields fall back to manual entry. The amount, in particular, is re-validated via `parseAmountToPence` on confirm.
- **PDF/image content blocks:** verify the installed `@anthropic-ai/sdk` supports the `document` (PDF) content block for the chosen model at build time; if a model/SDK combination rejects PDF, document the limitation.
- **File storage persistence:** `UPLOAD_DIR` must be on a persistent volume in production (Docker) or receipts are lost on redeploy — documented.
- **Privacy:** uploaded receipts are sent to Anthropic for extraction; note this in the UI/README so the operator is aware before enabling.
- **Secrets:** `ANTHROPIC_API_KEY` only in env, never logged; the extraction wrapper must not log the key or full file bytes.
