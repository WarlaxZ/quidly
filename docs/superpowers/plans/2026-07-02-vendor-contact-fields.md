# Vendor Contact Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Vendor.contactDetails` (one freeform string) with structured `email` / `phone` / `address` columns, and fix the Akaunting importer to map those three fields straight through instead of concatenating them.

**Architecture:** A single cohesive column rename across schema → migration → Prisma client → importer → data layer → UI. Because it renames a Prisma field, intermediate `tsc` states are red until the whole rename lands; the task's exit criterion is full green (Vitest + `tsc --noEmit`) after `prisma generate`. TDD drives the one pure unit under test (the importer's `buildPlan`).

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma v7 + SQLite (`@prisma/adapter-better-sqlite3`), hand-authored SQL migrations applied with `prisma migrate deploy`, Vitest.

---

## Task 1: Rename `Vendor.contactDetails` → `email`/`phone`/`address` end to end

This is one coherent refactor. Do the steps in order. Because a Prisma field is being renamed, `tsc` will report errors at the not-yet-updated call sites between steps — that is expected; the final steps bring everything green.

**Files:**
- Modify: `prisma/schema.prisma` (Vendor model, ~lines 62-72)
- Create: `prisma/migrations/20260702160000_vendor_contact_fields/migration.sql`
- Modify: `scripts/migrate-akaunting/transform.test.ts` (buildPlan cases)
- Modify: `scripts/migrate-akaunting/types.ts` (`VendorPayload`)
- Modify: `scripts/migrate-akaunting/transform.ts` (drop `contactDetails()` helper; buildPlan mapping)
- Modify: `scripts/migrate-akaunting/apply.ts` (~line 85-87, `vendor.create` data)
- Modify: `src/lib/data/vendors.ts` (`VendorInput`)
- Modify: `src/app/(app)/vendors/actions.ts` (`addVendorAction`)
- Modify: `src/app/(app)/vendors/edit-actions.ts` (`updateVendorAction`)
- Modify: `src/app/(app)/vendors/page.tsx` (create form + list "Contact" column)
- Modify: `src/app/(app)/vendors/[id]/edit/page.tsx` (edit form)

---

- [ ] **Step 1: Update the Prisma schema**

In `prisma/schema.prisma`, replace the `Vendor` model's `contactDetails` line so the model reads:

```prisma
model Vendor {
  id                String          @id @default(cuid())
  name              String
  email             String?
  phone             String?
  address           String?
  notes             String?
  externalRef       String?         @unique
  defaultCategoryId String?
  defaultCategory   Category?       @relation(fields: [defaultCategoryId], references: [id])
  transactions      Transaction[]
  recurringRules    RecurringRule[]
}
```

(Only the `contactDetails String?` line changes — into the three `String?` lines. Keep the rest of the model exactly as it is; match the existing relation formatting.)

- [ ] **Step 2: Create the migration SQL**

Create `prisma/migrations/20260702160000_vendor_contact_fields/migration.sql`:

```sql
ALTER TABLE "Vendor" ADD COLUMN "email" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "phone" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "address" TEXT;
ALTER TABLE "Vendor" DROP COLUMN "contactDetails";
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: migration `20260702160000_vendor_contact_fields` applied; client generated. (Never use `prisma migrate dev`.)

- [ ] **Step 4: Update the importer tests to expect structured fields (TDD — write failing test first)**

In `scripts/migrate-akaunting/transform.test.ts`:

Change the expected vendor in the "builds vendor and transaction payloads for GBP transactions" case from
```ts
      { externalRef: "akaunting:contact:7", name: "Acme Plumbing", contactDetails: null },
```
to
```ts
      { externalRef: "akaunting:contact:7", name: "Acme Plumbing", email: null, phone: null, address: null },
```

Replace the entire "builds contactDetails from email/phone/address when present" test with:
```ts
  it("maps email/phone/address through to the vendor payload separately", () => {
    const s = baseSnapshot();
    s.contacts[0] = { id: 7, name: "Acme Plumbing", type: "vendor", email: "a@b.com", phone: "0123", address: "1 High St" };
    const plan = buildPlan(s, baseMapping());
    expect(plan.vendors[0]).toMatchObject({ email: "a@b.com", phone: "0123", address: "1 High St" });
  });
```

Leave every other test (including the "skips non-GBP … `vendors: []`" case) unchanged.

- [ ] **Step 5: Run the importer tests to confirm they fail**

Run: `npx vitest run scripts/migrate-akaunting/transform.test.ts`
Expected: FAIL — the buildPlan cases fail because `VendorPayload` still has `contactDetails`.

- [ ] **Step 6: Update `VendorPayload` in the importer types**

In `scripts/migrate-akaunting/types.ts`, replace in the `VendorPayload` interface:
```ts
  contactDetails: string | null;
```
with:
```ts
  email: string | null;
  phone: string | null;
  address: string | null;
```

- [ ] **Step 7: Update `buildPlan` and remove the concatenation helper**

In `scripts/migrate-akaunting/transform.ts`:

Delete the `contactDetails()` helper function entirely (the `function contactDetails(c: …) { … }` block, ~lines 87-90).

Change the `vendors` mapping in `buildPlan` from
```ts
    .map((c) => ({
      externalRef: `akaunting:contact:${c.id}`,
      name: c.name,
      contactDetails: contactDetails(c),
    }));
```
to
```ts
    .map((c) => ({
      externalRef: `akaunting:contact:${c.id}`,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
    }));
```

- [ ] **Step 8: Update the apply step**

In `scripts/migrate-akaunting/apply.ts`, change the `prisma.vendor.create` data (~line 86) from
```ts
      data: { name: v.name, contactDetails: v.contactDetails, externalRef: v.externalRef },
```
to
```ts
      data: { name: v.name, email: v.email, phone: v.phone, address: v.address, externalRef: v.externalRef },
```

- [ ] **Step 9: Run the importer tests to confirm they pass**

Run: `npx vitest run scripts/migrate-akaunting/transform.test.ts`
Expected: PASS.

- [ ] **Step 10: Update the data-layer `VendorInput`**

In `src/lib/data/vendors.ts`, replace in `VendorInput`:
```ts
  contactDetails?: string | null;
```
with:
```ts
  email?: string | null;
  phone?: string | null;
  address?: string | null;
```
(The `createVendor` / `updateVendor` bodies already spread the whole `input` — leave them unchanged.)

- [ ] **Step 11: Update the create action**

In `src/app/(app)/vendors/actions.ts`, in `addVendorAction`, replace:
```ts
    contactDetails: String(formData.get("contactDetails") ?? "") || null,
```
with:
```ts
    email: String(formData.get("email") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    address: String(formData.get("address") ?? "") || null,
```

- [ ] **Step 12: Update the edit action**

In `src/app/(app)/vendors/edit-actions.ts`, in `updateVendorAction`, replace:
```ts
    contactDetails: String(formData.get("contactDetails") ?? "") || null,
```
with:
```ts
    email: String(formData.get("email") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    address: String(formData.get("address") ?? "") || null,
```

- [ ] **Step 13: Update the create form + list column**

In `src/app/(app)/vendors/page.tsx`:

Replace the single "Contact (optional)" label/input:
```tsx
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Contact (optional)</span>
              <input name="contactDetails" placeholder="Email or phone" className="field" />
            </label>
```
with three inputs:
```tsx
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Email (optional)</span>
              <input name="email" type="email" placeholder="name@example.com" className="field" />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Phone (optional)</span>
              <input name="phone" placeholder="07123 456789" className="field" />
            </label>
            <label className="flex-1 min-w-[12rem]">
              <span className="label">Address (optional)</span>
              <input name="address" placeholder="1 High St" className="field" />
            </label>
```

Replace the list "Contact" cell:
```tsx
                    <td className="text-muted">{v.contactDetails ?? ""}</td>
```
with a stacked cell showing whichever fields are present:
```tsx
                    <td className="text-muted">
                      <div className="flex flex-col leading-tight">
                        {v.email && <span>{v.email}</span>}
                        {v.phone && <span>{v.phone}</span>}
                        {v.address && <span>{v.address}</span>}
                      </div>
                    </td>
```

- [ ] **Step 14: Update the edit form**

In `src/app/(app)/vendors/[id]/edit/page.tsx`, replace the single "Contact" label/input:
```tsx
          <label className="block">
            <span className="label">Contact</span>
            <input name="contactDetails" defaultValue={vendor.contactDetails ?? ""} className="field" />
          </label>
```
with three labelled inputs:
```tsx
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" defaultValue={vendor.email ?? ""} className="field" />
          </label>
          <label className="block">
            <span className="label">Phone</span>
            <input name="phone" defaultValue={vendor.phone ?? ""} className="field" />
          </label>
          <label className="block">
            <span className="label">Address</span>
            <input name="address" defaultValue={vendor.address ?? ""} className="field" />
          </label>
```

- [ ] **Step 15: Typecheck and run the full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: `tsc` clean (no `contactDetails` references remain anywhere); all tests pass.

If `tsc` still reports `contactDetails`, grep for stragglers: `grep -rn contactDetails src scripts prisma` — the only remaining hits should be in `docs/` and old migration SQL (`20260630105239_init`), which are historical and left as-is.

- [ ] **Step 16: Commit**

```bash
git add prisma src/lib/data/vendors.ts "src/app/(app)/vendors" scripts/migrate-akaunting docs/superpowers/plans/2026-07-02-vendor-contact-fields.md
git commit -m "feat: structured vendor email/phone/address fields

Replace Vendor.contactDetails with separate email/phone/address columns
and map them straight through in the Akaunting importer.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (controller, after Task 1 review)

- Full suite + `tsc --noEmit` green.
- Live-run: apply migration on dev.db, add a vendor with all three fields via the UI (stacked in list, preserved on edit), then re-run the Akaunting import against a fresh dev.db and spot-check a vendor has separate email/phone/address. Then re-import real data. Clean up any test rows.
