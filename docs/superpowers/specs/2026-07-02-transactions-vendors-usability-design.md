# Transactions & Vendors Usability Improvements — Design

**Date:** 2026-07-02
**Status:** Approved (pending spec review)

## Problem

Several usability rough edges surfaced after building the transactions and vendors
areas:

1. On the transactions list, clicking a row does nothing — you must click the small
   "Edit" button. Not intuitive.
2. The vendor name on a transaction row is plain text; there's no quick way to jump to
   the vendor's details (email/phone).
3. The transaction edit form's description is a tiny single-line input, and there's no
   way to attach a receipt or invoice.
4. Creating a vendor forces a full-page context; we want a popup/modal so we don't lose
   our place — reachable both from the vendors list and from the transaction form's
   vendor picker.

## Goals

- Clicking a transaction row opens its edit page.
- Vendor name on a row links to that vendor's edit page.
- Description is a multi-line textarea on both the add and edit transaction forms.
- Receipts/invoices can be attached on both add and edit; on edit, an existing receipt
  can be viewed, replaced, or removed.
- A create-vendor modal is available on the vendors list (replacing the always-visible
  inline form) and from the transaction form's vendor picker (without losing form state).

## Non-goals

- No read-only transaction detail page (row click goes straight to edit).
- No OCR/extraction on manually attached receipts (that's the separate scan flow).
- No changes to vendor fields beyond what the existing form already has
  (name / contactDetails / notes).

## Existing building blocks (reused, not rebuilt)

- `prisma/schema.prisma`: `Transaction.attachmentId` / `attachment` and the `Attachment`
  model already exist. `Transaction.vendorId` / `vendor` already exist.
- `src/lib/storage/files.ts`: `validateUpload(mimeType, size)`, `saveUpload(bytes, originalName, mimeType)`.
- `src/lib/extraction/config.ts`: `MAX_UPLOAD_BYTES`, `ALLOWED_MIME`.
- `src/lib/data/attachments.ts`: `createAttachment({ filePath, originalName, extractedData })`.
- `src/app/(app)/attachments/[id]/route.ts`: GET route that streams a stored file inline.
- `src/app/(app)/scan/actions.ts` → `uploadReceiptAction`: the canonical server-action
  file-handling pattern (`formData.get("file")`, `file instanceof File`,
  `Buffer.from(await f.arrayBuffer())`, validate, save, createAttachment).
- `src/lib/data/vendors.ts`: `createVendor(VendorInput)`, `listVendors()`, etc.
- `src/app/(app)/_ui/ConfirmSubmit.tsx`: the app's minimal `"use client"` wrapper pattern.

## Architecture

Pages remain **server components**; interactivity is added via small, focused
`"use client"` components (matching the `ConfirmSubmit` precedent). All mutations remain
**server actions**.

### New client components (`src/app/(app)/_ui/`)

- **`Modal.tsx`** — reusable overlay shell. Props: `open: boolean`, `onClose: () => void`,
  `title?: string`, `children`. Renders a fixed full-screen backdrop + centered card.
  Closes on backdrop click, on the ✕ button, and on Escape keydown. Styled with existing
  `.card` class + Tailwind utilities.
- **`TransactionRow.tsx`** — a `"use client"` `<tr>`. Props: the row's display data plus
  `id`, `vendorId`, `vendorName`, and the delete action. Uses `useRouter()`; the row's
  `onClick` pushes `/transactions/${id}/edit`. Cursor is pointer. Inner interactive
  elements call `e.stopPropagation()`:
    - vendor cell: `<a href="/vendors/${vendorId}/edit">` (only when a vendor exists),
    - the Edit link,
    - the delete `<form>` (wrapping `ConfirmSubmit`).
- **`VendorSelect.tsx`** — wraps the vendor `<select name="vendorId">` used by both the
  add and edit transaction forms. Props: `vendors: {id,name}[]`, `defaultValue?: string`.
  Holds the vendor list in state. Renders the `<select>` plus a "＋ New" button that opens
  a `Modal` containing the create-vendor fields. On success it appends the new vendor to
  its option list, selects it, and closes the modal — **no navigation**, so unsaved
  transaction-form fields are preserved.
- **`NewVendorButton.tsx`** — for the vendors list page. A "＋ New vendor" button that opens
  a `Modal` with the create-vendor fields. On success, closes the modal and calls
  `router.refresh()` so the new row appears with page/scroll position preserved.

`VendorSelect` and `NewVendorButton` share the same modal form markup and both call the
new returning server action below. (Form markup can be a small shared
`CreateVendorFields` component or duplicated — implementer's choice; it's tiny.)

### New / changed server action

`src/app/(app)/vendors/actions.ts`:

- **Add** `createVendorAction(input: { name: string; contactDetails?: string | null; notes?: string | null })`
  → `Promise<{ ok: true; vendor: { id: string; name: string } } | { ok: false; error: string }>`.
  Calls `requireSession()`, trims/validates `name` (returns `{ok:false}` if empty),
  calls `createVendor(...)`, `revalidatePath("/vendors")`, and **returns** the created
  vendor (no redirect). This is a returning action so the client can react.
- **Remove** the old form-style `addVendorAction` and its inline form usage (the vendors
  list inline add form is being replaced by the modal). `deleteVendorAction` is unchanged.

### Changed transaction actions

`src/app/(app)/transactions/actions.ts` — `addTransactionAction`:
- Read optional `file` from `formData`. If it's a `File` with size > 0: `validateUpload`,
  `saveUpload`, `createAttachment`, and pass the resulting `attachmentId` into
  `createTransaction`.

`src/app/(app)/transactions/edit-actions.ts` — `updateTransactionAction`:
- Read optional `file` and a `removeAttachment` flag from `formData`.
- If a new file is present: create the attachment and set `attachmentId` to the new id.
- Else if `removeAttachment` is set: pass `attachmentId: null`.
- Else: omit `attachmentId` from the update payload (leave unchanged). Relies on
  `updateTransaction` taking `Partial<TransactionInput>`, so an omitted key is untouched
  while an explicit `null` clears it.

### Changed pages

- **`src/app/(app)/transactions/page.tsx`**
  - Render each ledger row via `TransactionRow` (client) instead of an inline `<tr>`.
  - Add-transaction form: `encType="multipart/form-data"`; description → `<textarea rows={4}>`;
    vendor `<select>` → `VendorSelect`; add a receipt `<input type="file">`.
- **`src/app/(app)/transactions/[id]/edit/page.tsx`**
  - `getTransaction` include gains `attachment: true`.
  - Form: `encType="multipart/form-data"`; description → `<textarea rows={4}>`;
    vendor `<select>` → `VendorSelect`.
  - Attachment UI: if `txn.attachment` exists, show a "View receipt" link to
    `/attachments/${txn.attachmentId}`, a "Remove receipt" checkbox (`name="removeAttachment"`),
    and a file input to replace. If none, just the file input to add.
- **`src/lib/data/transactions.ts`** — `getTransaction` include gains `attachment: true`.
- **`src/app/(app)/vendors/page.tsx`**
  - Remove the inline add-vendor form; add `NewVendorButton` (e.g. in the `PageHeader`
    actions area). Table/list unchanged.

## Data flow

- **Row click:** `TransactionRow.onClick` → `router.push('/transactions/[id]/edit')`. Nested
  links/forms stop propagation.
- **Attachment (add):** form (multipart) → `addTransactionAction` → validate/save/createAttachment
  → `createTransaction({ ..., attachmentId })` → revalidate + redirect.
- **Attachment (edit):** form (multipart) → `updateTransactionAction` computes `attachmentId`
  (new id / `null` / omitted) → `updateTransaction(id, partial)` → revalidate + redirect.
- **Vendor from list:** `NewVendorButton` → `createVendorAction` → on `{ok:true}` close +
  `router.refresh()`.
- **Vendor from transaction form:** `VendorSelect` "＋ New" → `createVendorAction` → on
  `{ok:true}` append option, select it, close modal; transaction form state preserved.

## Error handling

- `createVendorAction` returns `{ ok: false, error }` on empty name or thrown error; the
  modal displays the message inline and stays open. (Client wraps the call in try/catch and
  maps unexpected errors to a generic message.)
- File uploads: `validateUpload` throws on disallowed MIME / oversize; the transaction
  actions catch and redirect back with `?error=` (existing pattern) so the page's `Banner`
  shows it. The file input uses `accept="image/jpeg,image/png,application/pdf"` as a first-line
  guard.
- Row navigation is a no-op if `id` is missing (it never is).

## Testing

Follow the app's existing testing approach. Cover:
- `createVendorAction`: returns the created vendor on valid input; `{ok:false}` on empty name.
- `updateTransactionAction` attachment logic: new file replaces; `removeAttachment` clears to
  `null`; neither leaves `attachmentId` unchanged.
- `addTransactionAction`: attaches when a file is provided; no attachment otherwise.
- Manual/E2E smoke: row click navigates to edit; vendor link navigates to vendor edit and does
  not also trigger row nav; textarea renders; create-vendor modal works from both the vendors
  list (new row appears) and the transaction form (option added + selected, form state kept);
  receipt view/replace/remove all behave.

## Rollout / risk notes

- Making the add-transaction form multipart is safe (Next server actions handle `File`
  parts); existing non-file fields are read the same way.
- Replacing the inline vendor form with a modal is a visible change to the vendors page —
  intended per design approval.
