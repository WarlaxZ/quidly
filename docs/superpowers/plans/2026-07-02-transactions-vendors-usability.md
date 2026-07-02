# Transactions & Vendors Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make transaction rows clickable, link vendors, enlarge the description field, allow attaching receipts on add/edit, and add a create-vendor modal reachable from the vendors list and the transaction form.

**Architecture:** Pages stay server components; interactivity is added via small `"use client"` components (matching the existing `ConfirmSubmit` precedent). All mutations remain server actions. The `Attachment` model, upload pipeline (`validateUpload`/`saveUpload`/`createAttachment`), and file-serving route already exist and are reused.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 7 + SQLite, Tailwind v4 with custom `.card`/`.field`/`.btn`/`.label`/`.ledger` classes, Vitest (node environment, serial, shared SQLite test DB).

**Ordering note:** Tasks are ordered so the project type-checks and builds after every task. Shared components are built before the pages that consume them, and `addVendorAction` is only removed once its last consumer is updated.

**Testing note:** This repo has no client-component or server-action unit tests and no jsdom/RTL setup (`environment: "node"`). Adding those would be scope creep. So TDD with Vitest applies to the **data layer** (Task 1); client components, server actions, and pages are verified by `npx tsc --noEmit` and a manual smoke test at the end (Task 12). This mirrors the existing codebase conventions.

---

### Task 1: Data layer — `getTransaction` includes the attachment, and attachment link/clear semantics

**Files:**
- Modify: `src/lib/data/transactions.ts` (the `getTransaction` function)
- Test: `src/lib/data/transactions.test.ts` (add cases to the existing file)

- [ ] **Step 1: Write the failing tests**

Add these two `it(...)` blocks inside the existing `describe("transactions data layer", () => { ... })` in `src/lib/data/transactions.test.ts` (the file already imports `createTransaction`, `updateTransaction`, `getTransaction` is dynamically imported, `resetDb`, `prisma`, `getOrCreateDefaultProperty`, and defines `rentCategoryId()`):

```ts
  it("includes the linked attachment on getTransaction", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const { createAttachment } = await import("./attachments");
    const attachment = await createAttachment({
      filePath: "/tmp/receipt.pdf",
      originalName: "receipt.pdf",
      extractedData: null,
    });
    const t = await createTransaction({
      propertyId: property.id,
      categoryId,
      date: new Date("2025-06-01"),
      amountPence: 5000,
      direction: "out",
      attachmentId: attachment.id,
    });
    const { getTransaction } = await import("./transactions");
    const fetched = await getTransaction(t.id);
    expect(fetched?.attachment?.originalName).toBe("receipt.pdf");
  });

  it("clears an attachment when updated with attachmentId null but leaves it when the key is omitted", async () => {
    const property = await getOrCreateDefaultProperty();
    const categoryId = await rentCategoryId();
    const { createAttachment } = await import("./attachments");
    const attachment = await createAttachment({
      filePath: "/tmp/receipt2.pdf",
      originalName: "receipt2.pdf",
      extractedData: null,
    });
    const t = await createTransaction({
      propertyId: property.id,
      categoryId,
      date: new Date("2025-06-01"),
      amountPence: 5000,
      direction: "out",
      attachmentId: attachment.id,
    });
    const { getTransaction } = await import("./transactions");

    // Omitting attachmentId leaves it unchanged
    await updateTransaction(t.id, { amountPence: 6000 });
    expect((await getTransaction(t.id))?.attachmentId).toBe(attachment.id);

    // Passing null clears it
    await updateTransaction(t.id, { attachmentId: null });
    expect((await getTransaction(t.id))?.attachmentId).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/data/transactions.test.ts`
Expected: The "includes the linked attachment" test FAILS — `fetched?.attachment` is `undefined` because `getTransaction` does not include the `attachment` relation. (The clear/omit test may already pass; that's fine — it locks in the semantics the remove feature depends on.)

- [ ] **Step 3: Add the attachment include**

In `src/lib/data/transactions.ts`, change `getTransaction` from:

```ts
export function getTransaction(id: string) {
  return prisma.transaction.findUnique({ where: { id }, include: { category: true, vendor: true } });
}
```

to:

```ts
export function getTransaction(id: string) {
  return prisma.transaction.findUnique({ where: { id }, include: { category: true, vendor: true, attachment: true } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/data/transactions.test.ts`
Expected: PASS (all cases, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/transactions.ts src/lib/data/transactions.test.ts
git commit -m "feat(transactions): include attachment in getTransaction; test attachment link/clear semantics"
```

---

### Task 2: Reusable `Modal` client component

**Files:**
- Create: `src/app/(app)/_ui/Modal.tsx`

- [ ] **Step 1: Create the Modal component**

Create `src/app/(app)/_ui/Modal.tsx`:

```tsx
"use client";
import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          {title ? <h2 className="text-lg font-semibold text-ink">{title}</h2> : <span />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/_ui/Modal.tsx"
git commit -m "feat(ui): reusable Modal overlay component"
```

---

### Task 3: Returning `createVendorAction` server action

Add a returning action alongside the existing form-style `addVendorAction`. `addVendorAction` is kept for now (its consumer, the vendors page, is updated in Task 6) so the build stays green.

**Files:**
- Modify: `src/app/(app)/vendors/actions.ts`

- [ ] **Step 1: Add the returning action**

In `src/app/(app)/vendors/actions.ts`, add the following export (leave `addVendorAction` and `deleteVendorAction` untouched for now):

```ts
export async function createVendorAction(input: {
  name: string;
  contactDetails?: string | null;
  notes?: string | null;
}): Promise<
  | { ok: true; vendor: { id: string; name: string } }
  | { ok: false; error: string }
> {
  await requireSession();
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  try {
    const vendor = await createVendor({
      name,
      contactDetails: String(input.contactDetails ?? "").trim() || null,
      notes: String(input.notes ?? "").trim() || null,
    });
    revalidatePath("/vendors");
    return { ok: true, vendor: { id: vendor.id, name: vendor.name } };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Couldn't create vendor." };
  }
}
```

(`createVendor`, `requireSession`, and `revalidatePath` are already imported at the top of the file.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/vendors/actions.ts"
git commit -m "feat(vendors): add returning createVendorAction for modal use"
```

---

### Task 4: `CreateVendorModal` client component

**Files:**
- Create: `src/app/(app)/_ui/CreateVendorModal.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(app)/_ui/CreateVendorModal.tsx`:

```tsx
"use client";
import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { createVendorAction } from "../vendors/actions";

export function CreateVendorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: { id: string; name: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const result = await createVendorAction({
        name: String(fd.get("name") ?? ""),
        contactDetails: String(fd.get("contactDetails") ?? ""),
        notes: String(fd.get("notes") ?? ""),
      });
      if (result.ok) {
        onCreated(result.vendor);
        onClose();
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New vendor">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? <p className="text-sm text-negative">{error}</p> : null}
        <label className="block">
          <span className="label">Name</span>
          <input name="name" placeholder="e.g. Plumber Ltd" required autoFocus className="field" />
        </label>
        <label className="block">
          <span className="label">Contact (optional)</span>
          <input name="contactDetails" placeholder="Email or phone" className="field" />
        </label>
        <label className="block">
          <span className="label">Notes (optional)</span>
          <input name="notes" placeholder="Any notes" className="field" />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Add vendor"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors. In particular, `result.ok` should narrow the union correctly (confirms Task 3's return type is inferred across the import).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/_ui/CreateVendorModal.tsx"
git commit -m "feat(ui): CreateVendorModal wrapping create-vendor form"
```

---

### Task 5: `NewVendorButton` client component (for the vendors list)

**Files:**
- Create: `src/app/(app)/_ui/NewVendorButton.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(app)/_ui/NewVendorButton.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateVendorModal } from "./CreateVendorModal";

export function NewVendorButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        ＋ New vendor
      </button>
      <CreateVendorModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/_ui/NewVendorButton.tsx"
git commit -m "feat(ui): NewVendorButton opens create-vendor modal and refreshes list"
```

---

### Task 6: Vendors page uses the modal; remove the inline form and `addVendorAction`

**Files:**
- Modify: `src/app/(app)/vendors/page.tsx`
- Modify: `src/app/(app)/vendors/actions.ts` (remove `addVendorAction`)

- [ ] **Step 1: Update the vendors page**

In `src/app/(app)/vendors/page.tsx`:

Change the imports block from:

```tsx
import { listVendors } from "../../../lib/data/vendors";
import { addVendorAction, deleteVendorAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";
```

to:

```tsx
import { listVendors } from "../../../lib/data/vendors";
import { deleteVendorAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";
import { NewVendorButton } from "../_ui/NewVendorButton";
```

Change the header from:

```tsx
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Vendors" />
      </div>
```

to:

```tsx
      <div className="reveal" style={{ animationDelay: "0ms" }}>
        <PageHeader title="Vendors">
          <NewVendorButton />
        </PageHeader>
      </div>
```

Delete the entire inline add-vendor `<section>` (the block that starts with `{/* Add-vendor form */}` and contains `<form action={addVendorAction} ...>` through its closing `</section>`):

```tsx
      {/* Add-vendor form */}
      <section className="reveal" style={{ animationDelay: "60ms" }}>
        <form action={addVendorAction} className="card p-5">
          <div className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.1em] text-faint">Add vendor</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Name</span>
              <input name="name" placeholder="e.g. Plumber Ltd" required className="field" />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Contact (optional)</span>
              <input name="contactDetails" placeholder="Email or phone" className="field" />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Notes (optional)</span>
              <input name="notes" placeholder="Any notes" className="field" />
            </label>
            <button type="submit" className="btn btn-primary">Add</button>
          </div>
        </form>
      </section>
```

(The `PageHeader` accepts children rendered in its actions area — confirm by opening `src/app/(app)/_ui/PageHeader.tsx`; the transactions page already passes an `<a>` child to it, so this pattern is established.)

- [ ] **Step 2: Remove `addVendorAction`**

In `src/app/(app)/vendors/actions.ts`, delete the entire `addVendorAction` function:

```ts
export async function addVendorAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createVendor({
    name,
    contactDetails: String(formData.get("contactDetails") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });
  revalidatePath("/vendors");
  redirect("/vendors?ok=Vendor+added");
}
```

Leave `createVendorAction` and `deleteVendorAction`. Note: `createVendor`, `revalidatePath`, and `requireSession` are still used by `createVendorAction`; `redirect` is still used by `deleteVendorAction`. Do not remove those imports.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors (no remaining references to `addVendorAction`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/vendors/page.tsx" "src/app/(app)/vendors/actions.ts"
git commit -m "feat(vendors): replace inline add form with create-vendor modal button"
```

---

### Task 7: `VendorSelect` client component (dropdown + quick-add)

**Files:**
- Create: `src/app/(app)/_ui/VendorSelect.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(app)/_ui/VendorSelect.tsx`:

```tsx
"use client";
import { useState } from "react";
import { CreateVendorModal } from "./CreateVendorModal";

export function VendorSelect({
  vendors,
  defaultValue,
}: {
  vendors: { id: string; name: string }[];
  defaultValue?: string;
}) {
  const [options, setOptions] = useState(() => vendors.map((v) => ({ id: v.id, name: v.name })));
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <select
          name="vendorId"
          className="field"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— vendor —</option>
          {options.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost whitespace-nowrap !px-3"
          onClick={() => setOpen(true)}
          title="Create a new vendor"
        >
          ＋ New
        </button>
      </div>
      <CreateVendorModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(vendor) => {
          setOptions((prev) =>
            [...prev, vendor].sort((a, b) => a.name.localeCompare(b.name)),
          );
          setSelected(vendor.id);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/_ui/VendorSelect.tsx"
git commit -m "feat(ui): VendorSelect dropdown with inline quick-add vendor"
```

---

### Task 8: `TransactionRow` client component (clickable row + vendor link)

**Files:**
- Create: `src/app/(app)/_ui/TransactionRow.tsx`

- [ ] **Step 1: Create the component**

Create `src/app/(app)/_ui/TransactionRow.tsx`:

```tsx
"use client";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteTransactionAction } from "../transactions/actions";
import { ConfirmSubmit } from "./ConfirmSubmit";

export function TransactionRow({
  id,
  date,
  showProperty,
  propertyName,
  categoryName,
  vendorId,
  vendorName,
  description,
  amountLabel,
}: {
  id: string;
  date: string;
  showProperty: boolean;
  propertyName: string;
  categoryName: string;
  vendorId: string | null;
  vendorName: string;
  description: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <tr className="cursor-pointer" onClick={() => router.push(`/transactions/${id}/edit`)}>
      <td className="text-muted">{date}</td>
      {showProperty && <td className="text-muted">{propertyName}</td>}
      <td className="font-medium text-ink">{categoryName}</td>
      <td className="text-muted">
        {vendorId ? (
          <a
            href={`/vendors/${vendorId}/edit`}
            className="text-forest hover:underline"
            onClick={stop}
          >
            {vendorName}
          </a>
        ) : (
          ""
        )}
      </td>
      <td className="text-muted">{description}</td>
      <td className="money text-right">{amountLabel}</td>
      <td className="text-right">
        <div className="flex items-center justify-end gap-3" onClick={stop}>
          <a
            href={`/transactions/${id}/edit`}
            className="text-sm font-medium text-forest hover:underline"
          >
            Edit
          </a>
          <form action={deleteTransactionAction}>
            <input type="hidden" name="id" value={id} />
            <ConfirmSubmit confirm="Delete this transaction? This can't be undone.">
              Delete
            </ConfirmSubmit>
          </form>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors. (`deleteTransactionAction` is a server action exported from `../transactions/actions` and is valid to pass to a `<form action>` inside a client component.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/_ui/TransactionRow.tsx"
git commit -m "feat(ui): clickable TransactionRow with linked vendor"
```

---

### Task 9: Transactions list page — use `TransactionRow`, `VendorSelect`, textarea, file input

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx`

- [ ] **Step 1: Update imports**

In `src/app/(app)/transactions/page.tsx`, change the imports block from:

```tsx
import { addTransactionAction, deleteTransactionAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { MoneyInput } from "../_ui/MoneyInput";
import { ConfirmSubmit } from "../_ui/ConfirmSubmit";
```

to:

```tsx
import { addTransactionAction } from "./actions";
import { PageHeader } from "../_ui/PageHeader";
import { Banner } from "../_ui/Banner";
import { EmptyState } from "../_ui/EmptyState";
import { MoneyInput } from "../_ui/MoneyInput";
import { VendorSelect } from "../_ui/VendorSelect";
import { TransactionRow } from "../_ui/TransactionRow";
```

(`deleteTransactionAction` and `ConfirmSubmit` move into `TransactionRow`, so they're no longer imported here.)

- [ ] **Step 2: Make the add form multipart and enlarge description; swap vendor select; add file input**

In the add-transaction `<form>`, change the opening tag from:

```tsx
        <form action={addTransactionAction} className="card p-5">
```

to:

```tsx
        <form action={addTransactionAction} encType="multipart/form-data" className="card p-5">
```

Replace the vendor `<label>` block:

```tsx
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Vendor</span>
              <select name="vendorId" className="field">
                <option value="">— vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
```

with:

```tsx
            <label className="flex-1 min-w-[10rem]">
              <span className="label">Vendor</span>
              <VendorSelect vendors={vendors} />
            </label>
```

Replace the description `<label>` block:

```tsx
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Description</span>
              <input name="description" placeholder="Optional note" className="field" />
            </label>
```

with (a 2-row textarea keeps the inline add form compact while giving more room; the edit page uses 4 rows):

```tsx
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Description</span>
              <textarea name="description" placeholder="Optional note" rows={2} className="field" />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Receipt (optional)</span>
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,application/pdf"
                className="field"
              />
            </label>
```

- [ ] **Step 3: Replace the rendered rows with `TransactionRow`**

Replace the `{txns.map((t) => ( ... ))}` block:

```tsx
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td className="text-muted">{t.date.toISOString().slice(0, 10)}</td>
                      {active.isAll && (
                        <td className="text-muted">{t.property?.name}</td>
                      )}
                      <td className="font-medium text-ink">{t.category.name}</td>
                      <td className="text-muted">{t.vendor?.name ?? ""}</td>
                      <td className="text-muted">{t.description ?? ""}</td>
                      <td className="money text-right">
                        {t.direction === "out" ? "−" : ""}
                        {formatGBP(t.amountPence)}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          <a
                            href={`/transactions/${t.id}/edit`}
                            className="text-sm font-medium text-forest hover:underline"
                          >
                            Edit
                          </a>
                          <form action={deleteTransactionAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmSubmit confirm="Delete this transaction? This can't be undone.">
                              Delete
                            </ConfirmSubmit>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
```

with:

```tsx
                  {txns.map((t) => (
                    <TransactionRow
                      key={t.id}
                      id={t.id}
                      date={t.date.toISOString().slice(0, 10)}
                      showProperty={active.isAll}
                      propertyName={t.property?.name ?? ""}
                      categoryName={t.category.name}
                      vendorId={t.vendorId}
                      vendorName={t.vendor?.name ?? ""}
                      description={t.description ?? ""}
                      amountLabel={`${t.direction === "out" ? "−" : ""}${formatGBP(t.amountPence)}`}
                    />
                  ))}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. (`formatGBP` is still imported and used; `t.vendorId` is a scalar returned by `listTransactionsFiltered`.)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/transactions/page.tsx"
git commit -m "feat(transactions): clickable rows, vendor quick-add, textarea + receipt on add form"
```

---

### Task 10: `addTransactionAction` handles the optional receipt upload

**Files:**
- Modify: `src/app/(app)/transactions/actions.ts`

- [ ] **Step 1: Update the action**

Replace the entire contents of `src/app/(app)/transactions/actions.ts` with:

```ts
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
```

(`redirect()` throws internally, so calling it inside the `catch` correctly aborts the request; this mirrors the existing `parseAmountToPence` error path and `scan/actions.ts`.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/transactions/actions.ts"
git commit -m "feat(transactions): attach optional receipt on add"
```

---

### Task 11: Edit transaction page — textarea, `VendorSelect`, attachment UI, multipart

**Files:**
- Modify: `src/app/(app)/transactions/[id]/edit/page.tsx`

- [ ] **Step 1: Add the `VendorSelect` import**

In `src/app/(app)/transactions/[id]/edit/page.tsx`, add to the imports (after the `MoneyInput` import):

```tsx
import { VendorSelect } from "../../../_ui/VendorSelect";
```

- [ ] **Step 2: Make the form multipart**

Change:

```tsx
        <form action={updateTransactionAction} className="card p-6">
```

to:

```tsx
        <form action={updateTransactionAction} encType="multipart/form-data" className="card p-6">
```

- [ ] **Step 3: Swap the vendor select**

Replace:

```tsx
            <label>
              <span className="label">Vendor</span>
              <select name="vendorId" defaultValue={txn.vendorId ?? ""} className="field">
                <option value="">— vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
```

with:

```tsx
            <label>
              <span className="label">Vendor</span>
              <VendorSelect vendors={vendors} defaultValue={txn.vendorId ?? ""} />
            </label>
```

- [ ] **Step 4: Enlarge the description field**

Replace:

```tsx
            <label>
              <span className="label">Description</span>
              <input
                name="description"
                defaultValue={txn.description ?? ""}
                placeholder="Optional note"
                className="field"
              />
            </label>
```

with:

```tsx
            <label className="sm:col-span-2">
              <span className="label">Description</span>
              <textarea
                name="description"
                defaultValue={txn.description ?? ""}
                placeholder="Optional note"
                rows={4}
                className="field"
              />
            </label>
```

- [ ] **Step 5: Add the receipt/invoice attachment UI**

The grid `</div>` closes the two-column field grid. Immediately after that closing `</div>` (and before the `<div className="mt-6 flex items-center gap-3">` that holds the Save/Cancel buttons), insert:

```tsx
          <div className="mt-4">
            <span className="label">Receipt / invoice</span>
            {txn.attachment ? (
              <div className="mb-2 flex flex-wrap items-center gap-4 text-sm">
                <a
                  href={`/attachments/${txn.attachmentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-forest hover:underline"
                >
                  View current: {txn.attachment.originalName}
                </a>
                <label className="flex items-center gap-1.5 text-muted">
                  <input type="checkbox" name="removeAttachment" />
                  Remove
                </label>
              </div>
            ) : null}
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,application/pdf"
              className="field"
            />
            <p className="mt-1 text-xs text-faint">
              {txn.attachment
                ? "Upload a file to replace the current one."
                : "Attach a JPG, PNG, or PDF (max 10 MB)."}
            </p>
          </div>
```

(`txn.attachment` and `txn.attachmentId` are available because Task 1 added `attachment: true` to the `getTransaction` include.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/transactions/[id]/edit/page.tsx"
git commit -m "feat(transactions): edit page textarea, vendor quick-add, receipt view/replace/remove"
```

---

### Task 12: `updateTransactionAction` handles replace / remove / unchanged attachment

**Files:**
- Modify: `src/app/(app)/transactions/edit-actions.ts`

- [ ] **Step 1: Update the action**

Replace the entire contents of `src/app/(app)/transactions/edit-actions.ts` with:

```ts
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
```

- [ ] **Step 2: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: Type-check clean; all Vitest tests pass (including Task 1's data-layer tests confirming the attachment link/clear semantics this action relies on).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/transactions/edit-actions.ts"
git commit -m "feat(transactions): edit action replaces/removes/keeps receipt attachment"
```

- [ ] **Step 4: Full build + manual smoke test**

Run: `npm run build`
Expected: Build succeeds.

Then run the app (`npm run dev`) and manually verify:
1. Transactions list: clicking anywhere on a row (not on the vendor link, Edit, or Delete) navigates to that transaction's edit page.
2. Clicking a vendor name on a row navigates to `/vendors/[id]/edit` and does NOT also open the edit page.
3. Add-transaction form: description is a multi-line box; choosing a receipt file and adding creates a transaction with a viewable attachment.
4. Add/edit transaction form: the "＋ New" button next to Vendor opens the modal; creating a vendor adds it to the dropdown, selects it, closes the modal, and the rest of the form's input is preserved.
5. Edit page: description is a 4-row textarea; for a transaction with a receipt, "View current" opens the file; uploading a new file replaces it; ticking "Remove" and saving clears it; saving with neither leaves it unchanged.
6. Vendors list: the "＋ New vendor" button opens the modal; saving adds the vendor to the list (page position preserved) and there is no longer an always-visible inline add form.

---

## Self-Review

**Spec coverage:**
- Clickable rows → Task 8 + Task 9 (Step 3). ✓
- Vendor name links to vendor edit → Task 8 (vendor `<a>` with `stopPropagation`). ✓
- Bigger description (add + edit) → Task 9 (Step 2, textarea) + Task 11 (Step 4, textarea). ✓
- Receipt attachment add → Task 9 (file input) + Task 10 (action). ✓
- Receipt attachment edit with view/replace/remove → Task 1 (include) + Task 11 (UI) + Task 12 (action). ✓
- Create-vendor modal on vendors list → Tasks 2, 3, 4, 5, 6. ✓
- Create-vendor modal from transaction form → Tasks 4, 7, 9, 11. ✓
- Shared returning `createVendorAction`; old `addVendorAction` removed → Task 3 + Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The description `rows` deviation (2 on the compact add form, 4 on the edit page) is stated explicitly, not left vague.

**Type consistency:** `createVendorAction` returns `{ ok: true; vendor: { id; name } } | { ok: false; error }`, consumed by `CreateVendorModal` (`result.ok`) which passes `{ id; name }` to `onCreated`, matching `VendorSelect`/`NewVendorButton` callback signatures. `VendorSelect` prop `vendors: { id: string; name: string }[]` accepts the fuller `listVendors()` objects (variable, not object literal — excess properties allowed). `TransactionRow` prop `vendorId: string | null` matches the scalar from `listTransactionsFiltered`. `TransactionInput.attachmentId?: string | null` is used consistently across Tasks 10 and 12.
