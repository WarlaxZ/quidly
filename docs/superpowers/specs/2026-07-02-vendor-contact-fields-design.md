# Vendor Contact Fields — Design

**Date:** 2026-07-02
**Status:** Approved (brainstorming)

## Goal

Give `Vendor` proper structured **email**, **phone**, and **address** fields, replacing the
single freeform `contactDetails` column. This also fixes the Akaunting importer, which
already reads Akaunting contacts' `email` / `phone` / `address` but currently **concatenates
them into one string** (`"a@b.com | 0123 | 1 High St"`), throwing the structure away. After
this change the importer maps each field straight through.

## Background

The Akaunting migration tool works, but revealed the model shortcoming: `SourceContact`
carries `email`, `phone`, `address` (see `scripts/migrate-akaunting/types.ts`), yet
`VendorPayload` and the `Vendor` model only have a single `contactDetails` string. The
`contactDetails()` helper in `transform.ts` joins the three with `" | "`.

## Decision (confirmed with user)

**Drop `contactDetails` entirely** (destructive). Real vendor data is repopulated by
re-running the Akaunting import, which will now write the three fields separately. No
best-effort parsing of the old concatenated values.

## Non-goals (YAGNI)

- No structured validation of email/phone formats (freeform text, as today).
- No migration/parsing of existing `contactDetails` values into the new columns.
- No change to `notes`, `defaultCategory`, or any other Vendor field.
- No new vendor-detail page — email/phone/address show in the existing list + edit form.

## Schema (`prisma/schema.prisma`)

On `model Vendor`, replace `contactDetails String?` with three optional columns:

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

## Migration (`prisma/migrations/20260702160000_vendor_contact_fields/migration.sql`)

Hand-authored SQL, applied with `prisma migrate deploy` (never `migrate dev`). The bundled
better-sqlite3 SQLite is ≥3.35, so `DROP COLUMN` is supported; there are no indexes on
`contactDetails`.

```sql
ALTER TABLE "Vendor" ADD COLUMN "email" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "phone" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "address" TEXT;
ALTER TABLE "Vendor" DROP COLUMN "contactDetails";
```

Run `npx prisma generate` after applying.

## Data layer (`src/lib/data/vendors.ts`)

`VendorInput` swaps `contactDetails` for the three fields:

```ts
export interface VendorInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  defaultCategoryId?: string | null;
}
```

`createVendor` / `updateVendor` pass `input` straight to Prisma (unchanged bodies —
they already spread the whole input). `getVendor`, `listVendors`, `deleteVendor`,
`matchVendorByName` unchanged.

## UI

**Create form** (`src/app/(app)/vendors/page.tsx`): replace the single "Contact (optional)"
input with three inputs — **Email** (`name="email"`, `type="email"`), **Phone**
(`name="phone"`), **Address** (`name="address"`) — each `flex-1 min-w-[12rem]`, matching the
existing field styling. The list table's "Contact" column renders a compact stacked cell:
the present values of email / phone / address, each on its own line (blank cell when none).

**Edit form** (`src/app/(app)/vendors/[id]/edit/page.tsx`): replace the single "Contact"
input with Email / Phone / Address inputs, each `defaultValue={vendor.<field> ?? ""}`.

## Actions

- `addVendorAction` (`vendors/actions.ts`): read `email` / `phone` / `address` from the
  form (`String(formData.get(f) ?? "") || null` each) instead of `contactDetails`.
- `updateVendorAction` (`vendors/edit-actions.ts`): same three fields instead of
  `contactDetails`.

## Importer (`scripts/migrate-akaunting/`)

- **`types.ts`** — `VendorPayload` replaces `contactDetails: string | null` with
  `email: string | null; phone: string | null; address: string | null`.
- **`transform.ts`** — delete the `contactDetails()` helper; in `buildPlan`, map:
  ```ts
  .map((c) => ({
    externalRef: `akaunting:contact:${c.id}`,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
  }));
  ```
- **`apply.ts`** — `prisma.vendor.create` data becomes
  `{ name: v.name, email: v.email, phone: v.phone, address: v.address, externalRef: v.externalRef }`.

## Tests

`scripts/migrate-akaunting/transform.test.ts`:
- The "builds vendor and transaction payloads" case: the expected vendor object becomes
  `{ externalRef: "akaunting:contact:7", name: "Acme Plumbing", email: null, phone: null, address: null }`.
- The "builds contactDetails from email/phone/address" case is renamed/rewritten to
  "maps email/phone/address through to the vendor payload" and asserts the three fields
  land separately:
  ```ts
  expect(plan.vendors[0]).toMatchObject({ email: "a@b.com", phone: "0123", address: "1 High St" });
  ```
- Other cases (`vendors: []` on the skipped-txn case) unchanged.

Full Vitest suite + `tsc --noEmit` must stay green after `prisma generate`.

## Docs

Update `docs/MIGRATING-FROM-AKAUNTING.md` (the "Migrating from Akaunting" guide) if it
describes vendor contact mapping, so it reflects the three separate fields.

## Verification (live-run)

1. `prisma migrate deploy` + `prisma generate` on dev.db.
2. Add a vendor via the UI with all three fields → appears in the list stacked; edit
   preserves them.
3. Re-run the Akaunting import against a fresh dev.db → spot-check a vendor has separate
   email/phone/address populated from the dump.
4. Then re-import the user's real data.

## File structure

```
prisma/schema.prisma                                  # Vendor: contactDetails → email/phone/address
prisma/migrations/20260702160000_vendor_contact_fields/migration.sql  # new
src/lib/data/vendors.ts                               # VendorInput fields
src/app/(app)/vendors/page.tsx                        # create form + list column
src/app/(app)/vendors/[id]/edit/page.tsx              # edit form
src/app/(app)/vendors/actions.ts                      # addVendorAction
src/app/(app)/vendors/edit-actions.ts                 # updateVendorAction
scripts/migrate-akaunting/types.ts                    # VendorPayload
scripts/migrate-akaunting/transform.ts                # buildPlan mapping; drop helper
scripts/migrate-akaunting/apply.ts                    # vendor.create data
scripts/migrate-akaunting/transform.test.ts           # updated expectations
docs/MIGRATING-FROM-AKAUNTING.md                      # if it mentions vendor mapping
```
