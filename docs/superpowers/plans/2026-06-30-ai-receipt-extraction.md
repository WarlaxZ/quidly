# AI Receipt Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user upload a receipt/invoice image or PDF and have Claude vision auto-fill an editable transaction (vendor, date, amount, category), storing the file as an archived attachment — gated on the operator's own Anthropic API key.

**Architecture:** A gated feature over the existing Next.js 16 + Prisma v7 app. Pure, mockable extraction logic (`buildExtractionTool`, `parseExtraction`) is TDD'd; the Anthropic SDK call is a thin wrapper with an injectable client so tests never hit the network. Uploaded files are validated, saved to a configurable dir, and linked via the existing `Attachment` table. Flow: upload → extract → review/confirm (never auto-create).

**Tech Stack:** Next.js 16 (App Router, route handlers, server actions), TypeScript, Prisma v7 + SQLite, Vitest, `@anthropic-ai/sdk`.

Reference spec: `docs/superpowers/specs/2026-06-30-ai-receipt-extraction-design.md`. Money is integer pence. New mutations call `requireSession()`; new routes are gated by `src/proxy.ts`. **Task 4 builds the Anthropic call — consult the `claude-api` skill** for the current model id, tool-use shape, and prompt caching.

---

## File Structure

- `src/lib/extraction/config.ts` — `isExtractionEnabled`, `getExtractionModel`, upload constants (NEW)
- `src/lib/storage/files.ts` — `validateUpload` (pure), `saveUpload` (NEW)
- `src/lib/extraction/extract.ts` — `buildExtractionTool`, `parseExtraction` (pure), `extractReceipt` (SDK wrapper) (NEW)
- `src/lib/data/attachments.ts` — `createAttachment`, `getAttachment` (NEW)
- `src/lib/data/vendors.ts` — add `matchVendorByName` (MODIFY)
- `src/app/(app)/attachments/[id]/route.ts` — stream a stored file (NEW)
- `src/app/(app)/scan/page.tsx` + `actions.ts` — upload + extract (NEW)
- `src/app/(app)/scan/review/page.tsx` — pre-filled review + confirm (NEW)
- `src/app/(app)/layout.tsx` — conditional "Scan" nav link (MODIFY)
- `.env.example`, `README.md` — env + privacy/cost note (MODIFY)
- `.gitignore` — ignore `uploads/` (MODIFY)
- `package.json` — `@anthropic-ai/sdk` (MODIFY)

No schema change (Attachment + Transaction.attachmentId already exist).

---

### Task 1: Dependency, config, gating

**Files:**
- Modify: `package.json`, `.gitignore`, `.env.example`, `README.md`
- Create: `src/lib/extraction/config.ts`, `src/lib/extraction/config.test.ts`

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Write the failing test** — `src/lib/extraction/config.test.ts`

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { isExtractionEnabled, getExtractionModel } from "./config";

const orig = { key: process.env.ANTHROPIC_API_KEY, model: process.env.EXTRACTION_MODEL };
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = orig.key;
  process.env.EXTRACTION_MODEL = orig.model;
});

describe("extraction config", () => {
  it("is disabled without an API key and enabled with one", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isExtractionEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(isExtractionEnabled()).toBe(true);
  });
  it("defaults the model and allows override", () => {
    delete process.env.EXTRACTION_MODEL;
    expect(getExtractionModel()).toBe("claude-haiku-4-5-20251001");
    process.env.EXTRACTION_MODEL = "claude-sonnet-4-6";
    expect(getExtractionModel()).toBe("claude-sonnet-4-6");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test src/lib/extraction/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/extraction/config.ts`**

```typescript
export function isExtractionEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getExtractionModel(): string {
  return process.env.EXTRACTION_MODEL ?? "claude-haiku-4-5-20251001";
}

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test src/lib/extraction/config.test.ts`
Expected: PASS.

- [ ] **Step 6: Ignore uploads, document env**

Add to `.gitignore`:
```
# Uploaded receipts
/uploads/
```

Append to `.env.example`:
```
# AI receipt scanning (optional) — set to enable the Scan feature. Uses YOUR Anthropic key (~pennies/receipt).
ANTHROPIC_API_KEY=
# Vision model for extraction (optional; defaults to a cheap vision-capable Claude model)
EXTRACTION_MODEL=
# Where uploaded receipts are stored (optional; mount as a persistent volume in production)
UPLOAD_DIR=./uploads
```

Append to `README.md` a "Receipt scanning" section:
```markdown
## Receipt scanning (optional AI)

Set `ANTHROPIC_API_KEY` to enable the Scan feature: upload a receipt/invoice image or PDF and
it pre-fills a transaction. Extraction uses your Anthropic API key (a few pence per receipt) and
sends the uploaded file to Anthropic for processing. Without the key, the feature is hidden.

Uploaded files are stored in `UPLOAD_DIR` (default `./uploads`) — mount it as a persistent
volume in production so receipts survive redeploys.

To test extraction end-to-end, set a real `ANTHROPIC_API_KEY` in `.env` and upload a receipt at `/scan`.
```

- [ ] **Step 7: Verify build + commit**

Run: `npm run build` (success) and `npm test` (all green).

```bash
git add -A && git commit -m "chore: anthropic SDK, extraction config + gating, env docs"
```

---

### Task 2: File validation + storage

**Files:**
- Create: `src/lib/storage/files.ts`, `src/lib/storage/files.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterAll, describe, expect, it } from "vitest";
import { rm, readFile } from "node:fs/promises";
import { validateUpload, saveUpload } from "./files";

afterAll(async () => { await rm("uploads", { recursive: true, force: true }); });

describe("validateUpload", () => {
  it("accepts allowed types within the size cap", () => {
    expect(() => validateUpload("image/jpeg", 1000)).not.toThrow();
    expect(() => validateUpload("application/pdf", 1000)).not.toThrow();
  });
  it("rejects disallowed types and oversize files", () => {
    expect(() => validateUpload("image/gif", 1000)).toThrow();
    expect(() => validateUpload("image/jpeg", 11 * 1024 * 1024)).toThrow();
  });
});

describe("saveUpload", () => {
  it("writes the bytes and returns a path + original name", async () => {
    const bytes = Buffer.from("hello receipt");
    const saved = await saveUpload(bytes, "receipt.jpg", "image/jpeg");
    expect(saved.originalName).toBe("receipt.jpg");
    expect(saved.filePath.endsWith(".jpg")).toBe(true);
    expect((await readFile(saved.filePath)).toString()).toBe("hello receipt");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/storage/files.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/storage/files.ts`**

```typescript
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/storage/files.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: upload validation and file storage"
```

---

### Task 3: Extraction tool + parser (pure core)

**Files:**
- Create: `src/lib/extraction/extract.ts`, `src/lib/extraction/extract.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildExtractionTool, parseExtraction } from "./extract";

const categories = [
  { id: "c-rent", name: "Rent received" },
  { id: "c-repairs", name: "Property repairs and maintenance" },
];

describe("buildExtractionTool", () => {
  it("offers the category ids as the categoryId enum", () => {
    const tool = buildExtractionTool(categories);
    expect(tool.name).toBe("record_receipt");
    expect(tool.input_schema.properties.categoryId.enum).toEqual(["c-rent", "c-repairs"]);
  });
});

describe("parseExtraction", () => {
  it("normalises a good extraction", () => {
    const r = parseExtraction(
      { vendorName: "B&Q", date: "2026-06-01", amount: 19.99, direction: "out", categoryId: "c-repairs", confidence: "high" },
      categories,
    );
    expect(r).toEqual({ vendorName: "B&Q", isoDate: "2026-06-01", amountPence: 1999, direction: "out", categoryId: "c-repairs", confidence: "high" });
  });
  it("nulls an unknown category and a bad date, defaults direction to out", () => {
    const r = parseExtraction({ vendorName: "X", date: "01/06/2026", amount: 5, categoryId: "nope" }, categories);
    expect(r.categoryId).toBeNull();
    expect(r.isoDate).toBeNull();
    expect(r.direction).toBe("out");
    expect(r.confidence).toBe("low");
  });
  it("throws when the amount is missing or non-positive", () => {
    expect(() => parseExtraction({ vendorName: "X", amount: 0 }, categories)).toThrow();
    expect(() => parseExtraction({ vendorName: "X" }, categories)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/extraction/extract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure parts in `src/lib/extraction/extract.ts`**

```typescript
import { poundsToPence } from "../tax/money";

export interface CategoryRef {
  id: string;
  name: string;
}

export interface Extraction {
  vendorName: string;
  isoDate: string | null;
  amountPence: number;
  direction: "in" | "out";
  categoryId: string | null;
  confidence: "high" | "medium" | "low";
}

export function buildExtractionTool(categories: CategoryRef[]) {
  return {
    name: "record_receipt",
    description: "Record structured details extracted from a UK receipt or invoice.",
    input_schema: {
      type: "object" as const,
      properties: {
        vendorName: { type: "string", description: "Merchant / supplier name." },
        date: { type: "string", description: "Transaction date as YYYY-MM-DD." },
        amount: { type: "number", description: "Total amount in pounds, e.g. 19.99." },
        direction: { type: "string", enum: ["in", "out"], description: "'out' for money spent (most receipts); 'in' for income." },
        categoryId: { type: "string", enum: categories.map((c) => c.id), description: "Best-matching category id. Options: " + categories.map((c) => `${c.id}=${c.name}`).join("; ") },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["vendorName", "amount", "direction", "confidence"],
    },
  };
}

export function parseExtraction(input: unknown, categories: CategoryRef[]): Extraction {
  const o = (input ?? {}) as Record<string, unknown>;
  const amountNum = typeof o.amount === "number" ? o.amount : Number(o.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error("Couldn't read a valid amount from the receipt.");
  }
  const validIds = new Set(categories.map((c) => c.id));
  return {
    vendorName: typeof o.vendorName === "string" ? o.vendorName.trim() : "",
    isoDate: typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null,
    amountPence: poundsToPence(amountNum),
    direction: o.direction === "in" ? "in" : "out",
    categoryId: typeof o.categoryId === "string" && validIds.has(o.categoryId) ? o.categoryId : null,
    confidence: o.confidence === "high" || o.confidence === "medium" ? o.confidence : "low",
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/extraction/extract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: extraction tool schema and result parser"
```

---

### Task 4: Anthropic call wrapper (injectable, mocked)

**Files:**
- Modify: `src/lib/extraction/extract.ts`, `src/lib/extraction/extract.test.ts`

**Context:** Consult the **claude-api skill** for the current tool-use message shape, model id, and prompt caching. The wrapper takes an optional client so tests inject a fake; production constructs a real `Anthropic` client.

- [ ] **Step 1: Write the failing test (mocked client)**

Add to `src/lib/extraction/extract.test.ts`:

```typescript
import { extractReceipt, type AnthropicLike } from "./extract";

describe("extractReceipt", () => {
  it("sends the file and parses the tool-use response", async () => {
    let captured: any = null;
    const fake: AnthropicLike = {
      messages: {
        create: async (params: any) => {
          captured = params;
          return { content: [{ type: "tool_use", name: "record_receipt", input: { vendorName: "Tesco", date: "2026-06-02", amount: 12.5, direction: "out", categoryId: "c-repairs", confidence: "high" } }] };
        },
      },
    };
    const r = await extractReceipt(Buffer.from("img"), "image/jpeg", categories, fake);
    expect(r.amountPence).toBe(1250);
    expect(r.vendorName).toBe("Tesco");
    expect(captured.tool_choice).toEqual({ type: "tool", name: "record_receipt" });
    // image sent as a base64 image block
    expect(captured.messages[0].content[0].type).toBe("image");
  });
  it("throws if no tool_use block is returned", async () => {
    const fake: AnthropicLike = { messages: { create: async () => ({ content: [{ type: "text", text: "no" }] }) } };
    await expect(extractReceipt(Buffer.from("x"), "image/jpeg", categories, fake)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test src/lib/extraction/extract.test.ts`
Expected: FAIL — `extractReceipt`/`AnthropicLike` not exported.

- [ ] **Step 3: Add the wrapper to `src/lib/extraction/extract.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { getExtractionModel } from "./config";

export interface AnthropicLike {
  messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; input?: unknown }> }> };
}

export async function extractReceipt(bytes: Buffer, mimeType: string, categories: CategoryRef[], client?: AnthropicLike): Promise<Extraction> {
  const c: AnthropicLike = client ?? (new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as unknown as AnthropicLike);
  const tool = buildExtractionTool(categories);
  const data = bytes.toString("base64");
  const fileBlock =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data } };

  const res = await c.messages.create({
    model: getExtractionModel(),
    max_tokens: 1024,
    system: [{ type: "text", text: "You extract structured transaction data from UK receipts and invoices. Always call record_receipt. Dates as YYYY-MM-DD; amount is the total in pounds.", cache_control: { type: "ephemeral" } }],
    tools: [{ ...tool, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: "record_receipt" },
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Extract the receipt details." }] }],
  });

  const toolUse = (res.content ?? []).find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("The model did not return structured data — try a clearer image.");
  return parseExtraction(toolUse.input, categories);
}
```

NOTE: if the installed SDK's TypeScript types reject the `params` object shape (e.g. stricter content-block unions), keep the wrapper's `AnthropicLike` boundary and cast the params object to the SDK's expected type at the call site — do not weaken `parseExtraction`. Verify the `document` (PDF) block is accepted by the chosen model per the claude-api skill.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test src/lib/extraction/extract.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + commit**

Run: `npm test` (all green) and `npm run build` (success) and `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` (0).

```bash
git add -A && git commit -m "feat: Anthropic vision extraction wrapper (injectable client)"
```

---

### Task 5: Attachments data layer + vendor matching

**Files:**
- Create: `src/lib/data/attachments.ts`, `src/lib/data/attachments.test.ts`
- Modify: `src/lib/data/vendors.ts`, `src/lib/data/vendors.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/data/attachments.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { createAttachment, getAttachment } from "./attachments";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("attachments data layer", () => {
  it("creates and fetches an attachment with extracted data", async () => {
    const a = await createAttachment({ filePath: "/tmp/r.jpg", originalName: "r.jpg", extractedData: '{"vendorName":"X"}' });
    const got = await getAttachment(a.id);
    expect(got?.originalName).toBe("r.jpg");
    expect(got?.extractedData).toBe('{"vendorName":"X"}');
    expect(await getAttachment("nope")).toBeNull();
  });
});
```

Add to `src/lib/data/vendors.test.ts`:

```typescript
  it("matches a vendor by name case-insensitively", async () => {
    await createVendor({ name: "Acme Lettings" });
    const { matchVendorByName } = await import("./vendors");
    expect((await matchVendorByName("acme lettings"))?.name).toBe("Acme Lettings");
    expect(await matchVendorByName("unknown")).toBeNull();
    expect(await matchVendorByName("  ")).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test src/lib/data/attachments.test.ts src/lib/data/vendors.test.ts`
Expected: FAIL — modules/functions missing.

- [ ] **Step 3: Implement**

Create `src/lib/data/attachments.ts`:

```typescript
import "server-only";
import { prisma } from "../db";

export function createAttachment(data: { filePath: string; originalName: string; extractedData: string | null }) {
  return prisma.attachment.create({ data });
}

export function getAttachment(id: string) {
  return prisma.attachment.findUnique({ where: { id } });
}
```

Add to `src/lib/data/vendors.ts`:

```typescript
export async function matchVendorByName(name: string) {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return null;
  const all = await prisma.vendor.findMany();
  return all.find((v) => v.name.trim().toLowerCase() === trimmed) ?? null;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test src/lib/data/attachments.test.ts src/lib/data/vendors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: attachments data layer and vendor name matching"
```

---

### Task 6: Attachment streaming route

**Files:**
- Create: `src/app/(app)/attachments/[id]/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
import { readFile } from "node:fs/promises";
import { getAttachment } from "../../../../lib/data/attachments";

function mimeFor(filePath: string): string {
  const p = filePath.toLowerCase();
  if (p.endsWith(".pdf")) return "application/pdf";
  if (p.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attachment = await getAttachment(id);
  if (!attachment) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(attachment.filePath);
    return new Response(bytes, {
      headers: {
        "Content-Type": mimeFor(attachment.filePath),
        "Content-Disposition": `inline; filename="${attachment.originalName}"`,
      },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}
```

(Auth-gated by `src/proxy.ts` — `/attachments/...` is not in the public allow-list.)

- [ ] **Step 2: Verify build + commit**

Run: `npm run build` (success; `/attachments/[id]` route listed).

```bash
git add -A && git commit -m "feat: gated attachment file streaming route"
```

---

### Task 7: Scan page + upload action + nav

**Files:**
- Create: `src/app/(app)/scan/actions.ts`, `src/app/(app)/scan/page.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Create `src/app/(app)/scan/actions.ts`**

```typescript
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
  let attachmentId: string;
  try {
    validateUpload(f.type, f.size);
    const bytes = Buffer.from(await f.arrayBuffer());
    const categories = (await listCategories()).map((c) => ({ id: c.id, name: c.name }));
    const extraction = await extractReceipt(bytes, f.type, categories); // throws on bad file / API error
    const saved = await saveUpload(bytes, f.name, f.type);
    const attachment = await createAttachment({ filePath: saved.filePath, originalName: saved.originalName, extractedData: JSON.stringify(extraction) });
    attachmentId = attachment.id;
  } catch (e) {
    redirect(`/scan?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/scan/review?attachmentId=${attachmentId}`);
}
```

(If TS flags `attachmentId` used-before-assigned because it can't see `redirect` throws, declare `let attachmentId!: string;`.)

- [ ] **Step 2: Create `src/app/(app)/scan/page.tsx`**

```tsx
import { isExtractionEnabled } from "../../../lib/extraction/config";
import { uploadReceiptAction } from "./actions";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!isExtractionEnabled()) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold">Scan a receipt</h1>
        <p className="rounded bg-yellow-100 px-3 py-2 text-yellow-800">
          Set <code>ANTHROPIC_API_KEY</code> in your environment to enable receipt scanning.
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Scan a receipt</h1>
      <p className="text-sm text-gray-600">Upload a receipt or invoice (JPG, PNG, or PDF). It will be read and used to pre-fill a transaction for you to review.</p>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <form action={uploadReceiptAction} className="space-y-3">
        <input type="file" name="file" accept="image/jpeg,image/png,application/pdf" required className="block" />
        <button type="submit" className="bg-blue-600 px-3 py-2 text-white">Scan</button>
      </form>
      <p className="text-xs text-gray-400">Scanning uses your Anthropic API key (~a few pence per receipt) and sends the file to Anthropic for processing.</p>
    </div>
  );
}
```

- [ ] **Step 3: Add the conditional Scan nav link**

In `src/app/(app)/layout.tsx`, import `isExtractionEnabled` and build the nav so "Scan" appears only when enabled. Replace the static `NAV` usage with:

```tsx
import { isExtractionEnabled } from "../../lib/extraction/config";
// ...
  const nav = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/transactions", label: "Transactions" },
    { href: "/import", label: "Import" },
    ...(isExtractionEnabled() ? [{ href: "/scan", label: "Scan" }] : []),
    { href: "/recurring", label: "Recurring" },
    { href: "/sa105", label: "SA105" },
    { href: "/vendors", label: "Vendors" },
    { href: "/settings", label: "Settings" },
  ];
```

and map over `nav` instead of the previous `NAV` constant (make the component the default export `async function`-free is fine; it's already a server component). Keep the logout form as-is.

- [ ] **Step 4: Verify build + manual (gating)**

Run: `npm run build` (success; `/scan` route listed).
Manual (no key): with `ANTHROPIC_API_KEY` unset, `/scan` shows the "set your key" message and the Scan nav link is absent.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: scan upload page, action, and gated nav link"
```

---

### Task 8: Review + confirm

**Files:**
- Create: `src/app/(app)/scan/review/page.tsx`, `src/app/(app)/scan/review/actions.ts`

- [ ] **Step 1: Create `src/app/(app)/scan/review/actions.ts`**

```typescript
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../../lib/auth/session";
import { getOrCreateDefaultProperty } from "../../../../lib/data/property";
import { createTransaction } from "../../../../lib/data/transactions";
import { parseAmountToPence } from "../../../../lib/money/parseAmount";
import type { Direction } from "../../../../lib/tax/types";

export async function confirmScanAction(formData: FormData) {
  await requireSession();
  const attachmentId = String(formData.get("attachmentId")) || null;
  let amountPence: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    redirect(`/scan/review?attachmentId=${attachmentId}&error=${encodeURIComponent((e as Error).message)}`);
  }
  const property = await getOrCreateDefaultProperty();
  await createTransaction({
    propertyId: property.id,
    categoryId: String(formData.get("categoryId")),
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: String(formData.get("direction")) as Direction,
    vendorId: String(formData.get("vendorId") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
    // @ts-expect-error attachmentId is a valid optional field on TransactionInput? If not, add it (see step 3 note).
    attachmentId,
  });
  revalidatePath("/transactions");
  redirect("/transactions");
}
```

NOTE: `TransactionInput` may not include `attachmentId`. In `src/lib/data/transactions.ts`, add `attachmentId?: string | null;` to the `TransactionInput` interface and pass it through in `createTransaction` (Prisma's `Transaction` has `attachmentId`). Then remove the `@ts-expect-error` line above. Do this as the first action in Step 1.

- [ ] **Step 2: Create `src/app/(app)/scan/review/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getAttachment } from "../../../../lib/data/attachments";
import { listCategories } from "../../../../lib/data/categories";
import { listVendors, matchVendorByName } from "../../../../lib/data/vendors";
import { penceToPounds } from "../../../../lib/tax/money";
import type { Extraction } from "../../../../lib/extraction/extract";
import { confirmScanAction } from "./actions";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ attachmentId?: string; error?: string }> }) {
  const { attachmentId, error } = await searchParams;
  if (!attachmentId) notFound();
  const attachment = await getAttachment(attachmentId);
  if (!attachment) notFound();
  const x = (attachment.extractedData ? JSON.parse(attachment.extractedData) : {}) as Partial<Extraction>;

  const [categories, vendors] = await Promise.all([listCategories(), listVendors()]);
  const matchedVendor = x.vendorName ? await matchVendorByName(x.vendorName) : null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Review scanned receipt</h1>
      <p className="text-sm text-gray-600">
        Extracted with {x.confidence ?? "low"} confidence ·{" "}
        <a href={`/attachments/${attachment.id}`} target="_blank" className="text-blue-600 hover:underline">view file</a>. Check and confirm.
      </p>
      {error && <p className="rounded bg-red-100 px-3 py-2 text-red-700">{error}</p>}
      <form action={confirmScanAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="attachmentId" value={attachment.id} />
        <input type="date" name="date" defaultValue={x.isoDate ?? ""} required className="border px-2 py-1" />
        <input name="amount" defaultValue={x.amountPence ? penceToPounds(x.amountPence) : ""} placeholder="£ amount" required className="border px-2 py-1" />
        <select name="direction" defaultValue={x.direction ?? "out"} className="border px-2 py-1">
          <option value="in">In</option>
          <option value="out">Out</option>
        </select>
        <select name="categoryId" defaultValue={x.categoryId ?? ""} required className="border px-2 py-1">
          <option value="" disabled>— category —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="vendorId" defaultValue={matchedVendor?.id ?? ""} className="border px-2 py-1">
          <option value="">— vendor —</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input name="description" defaultValue={!matchedVendor && x.vendorName ? x.vendorName : ""} placeholder="Description" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Confirm</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify build + tests + manual**

Run: `npm run build` (success; `/scan/review` route) and `npm test` (all green) and `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` (0).
Manual (no real API key needed): create an Attachment row with canned `extractedData` (e.g. via `prisma studio` or a one-off script) and a small file at its `filePath`, then visit `/scan/review?attachmentId=<id>`, confirm the form is pre-filled, submit, and check the transaction appears on `/transactions` linked to the attachment.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: scan review and confirm flow"
```

---

## Self-Review

**Spec coverage:**
- Config + gating (env key, model, UPLOAD_DIR, isExtractionEnabled) → Task 1. ✓
- File validation + storage (type/size, save) → Task 2. ✓
- Extraction tool schema + pure parser (categoryId enum, amount/date/direction/category rules) → Task 3. ✓
- Anthropic vision wrapper, tool-use, injectable/mockable, image+PDF blocks, caching → Task 4. ✓
- Attachment data layer + vendor matching → Task 5. ✓
- Gated file-streaming route → Task 6. ✓
- Scan upload page + action + conditional nav + cost/privacy note → Task 7. ✓
- Review (pre-filled, editable, view-file link, confidence) + confirm (re-validate amount, link attachmentId, source "imported") → Task 8. ✓
- Testing: pure (config, validateUpload, buildExtractionTool, parseExtraction), integration (saveUpload, attachments, vendor match), mocked SDK (extractReceipt); live-run caveat documented in README → Tasks 1-8 + Task 1 README. ✓
- Non-goals respected (no auto-create txn/vendor, no batch, no OCR fallback, no in-app spend metering). ✓

**Placeholder scan:** None. The two NOTEs (SDK param typing cast; adding `attachmentId` to `TransactionInput`) are concrete implementation instructions, not deferrals.

**Type consistency:** `Extraction`/`CategoryRef` defined in Task 3, reused by Task 4 (`extractReceipt`) and Task 8 (review page JSON parse). `AnthropicLike` defined in Task 4, used by its test. `createAttachment`/`getAttachment` (Task 5) consumed by Tasks 6, 7, 8. `matchVendorByName` (Task 5) used in Task 8. `TransactionInput.attachmentId` added in Task 8 Step 1 and used by `createTransaction`. `parseAmountToPence`/`penceToPounds`/`poundsToPence` reused. `isExtractionEnabled` (Task 1) used in Tasks 7. `requireSession` guards both new actions.

---

## Notes for the implementer

- **Use the claude-api skill in Task 4** to confirm the current model id, the exact tool-use/`tool_choice` shape, and prompt-cache placement for the installed `@anthropic-ai/sdk` version. The plan's code is correct in structure; reconcile any SDK type strictness at the `AnthropicLike` boundary with a cast, never by weakening `parseExtraction`.
- **No real API key in CI/tests:** every test mocks the client. The automated live-run verifies gating + storage + review/confirm via a hand-seeded Attachment; the genuine extraction is operator-verified with their key (documented in the README).
- **Order in Task 8 Step 1:** first add `attachmentId?: string | null` to `TransactionInput` and thread it through `createTransaction`, then the `@ts-expect-error` line is removed.
- **Secrets:** never log `ANTHROPIC_API_KEY` or full file bytes. The wrapper passes the key only to the SDK constructor.
- **`server-only`:** `files.ts`, `attachments.ts`, and `extract.ts` import server-only modules (fs, the SDK); they must never be imported into client components. The extraction config (`config.ts`) is plain (no server-only) since the layout (a server component) reads `isExtractionEnabled` — that's fine, but do NOT import `extract.ts`/`files.ts` into the layout.
