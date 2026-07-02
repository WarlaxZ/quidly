# Akaunting → Quidly Migration Utility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-phase CLI that imports an Akaunting MySQL dump (transactions, vendors, categories, best-effort attachments) into Quidly, via a reviewable mapping file, producing a "what's missing" gap report.

**Architecture:** `analyse <dump.sql>` loads the dump into a throwaway MariaDB (Docker), reads the relevant tables with `mysql2`, and freezes them to `akaunting-migration/source.json` plus an editable `mapping.json` and a human `report.md`. The user edits `mapping.json`. `apply` reads the frozen snapshot + mapping, runs pure transforms, and writes to Quidly's SQLite in one transaction — idempotent via a new `externalRef` column. Correctness lives in pure, unit-tested modules (`suggest`, `transform`, `report`); Docker/DB are thin adapters.

**Tech Stack:** TypeScript, `tsx`, Vitest, Prisma v7 + `@prisma/adapter-better-sqlite3`, `mysql2`, Docker (MariaDB), Node `child_process`/`fs`.

Design spec: `docs/superpowers/specs/2026-07-02-akaunting-migration-design.md`.

---

## Conventions (read before starting)

- **Scripts** run with `tsx` (see `package.json` `set-password`). New CLI: `scripts/migrate-akaunting/index.ts`.
- **PrismaClient** cannot be imported from `src/lib/db.ts` in a plain script (`server-only`). Build a fresh one exactly like `prisma/seed.ts`:
  ```ts
  import "dotenv/config";
  import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
  import { PrismaClient } from "@prisma/client";
  const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl }) });
  ```
- **Migrations** are hand-authored SQL folders `prisma/migrations/<UTC timestamp>_<name>/migration.sql`, applied with `npx prisma migrate deploy` (NOT `migrate dev`). Newest existing folder: `20260630160000_company_ledger`.
- **Tests** are co-located `*.test.ts`, run with `npm test` (`vitest run`). Import style: `import { describe, expect, it } from "vitest";`.
- **Money** everywhere in Quidly is integer pence.
- **Direction:** Quidly `Direction` enum is `in` | `out`. **TxnSource** has `imported`.
- **Quidly target categories** (from `prisma/seed.ts`, referenced by unique `name`):
  `Rent received` (20, income), `Other property income` (21, income),
  `Rent, rates, insurance, ground rents` (24, expense),
  `Property repairs and maintenance` (25, expense),
  `Legal, management, other professional fees` (27, expense),
  `Costs of services provided, including wages` (28, expense),
  `Other allowable property expenses` (29, expense),
  `Mortgage / loan interest` (44, finance), `Capital improvements` (no box, capital).

---

## File Structure

```
scripts/migrate-akaunting/
  types.ts         # shared interfaces (SourceSnapshot, Mapping, plan payloads)
  suggest.ts       # pure: Akaunting category name/type → suggested Quidly category   [tested]
  transform.ts     # pure: decimal→pence, validateMapping, buildPlan                  [tested, core]
  report.ts        # pure: snapshot + mapping → report.md string                      [tested]
  mariadb.ts       # Docker lifecycle: start MariaDB, load dump, teardown
  read.ts          # mysql2 queries → SourceSnapshot
  analyse.ts       # orchestrate analyse phase → write source/mapping/report files
  apply.ts         # buildPlan + applyPlan(prisma, plan) writes (txn, idempotent, dry-run, attachments)
  index.ts         # CLI arg parse + dispatch analyse|apply
  *.test.ts        # co-located tests for suggest, transform, report, apply
prisma/
  schema.prisma                          # + externalRef on Vendor & Transaction
  migrations/20260702120000_external_ref/migration.sql
```

---

## Task 1: Scaffold — deps, npm scripts, shared types

**Files:**
- Modify: `package.json` (add `mysql2` devDependency + two scripts)
- Create: `scripts/migrate-akaunting/types.ts`

- [ ] **Step 1: Add mysql2**

Run: `npm install --save-dev mysql2`
Expected: `mysql2` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add npm scripts**

In `package.json` `"scripts"`, add after `"set-password"`:

```json
    "migrate:akaunting:analyse": "tsx scripts/migrate-akaunting/index.ts analyse",
    "migrate:akaunting:apply": "tsx scripts/migrate-akaunting/index.ts apply"
```

- [ ] **Step 3: Create shared types**

Create `scripts/migrate-akaunting/types.ts`:

```ts
/** Frozen snapshot of the Akaunting records we care about. */
export interface SourceCompany {
  id: number;
  name: string;
}

export interface SourceContact {
  id: number;
  name: string;
  type: string; // "customer" | "vendor" (Akaunting values)
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface SourceCategory {
  id: number;
  name: string;
  type: string; // "income" | "expense" | "item" | "other"
}

export interface SourceTransaction {
  id: number;
  companyId: number;
  type: "income" | "expense";
  categoryId: number | null;
  contactId: number | null;
  paidAt: string; // ISO datetime string
  amount: string; // decimal as string, e.g. "123.4500"
  currencyCode: string; // e.g. "GBP"
  description: string | null;
}

export interface SourceAttachment {
  transactionId: number;
  filename: string;
  directory: string | null; // relative dir under Akaunting storage, if known
}

export interface SourceSnapshot {
  akauntingVersion: string | null;
  companies: SourceCompany[];
  contacts: SourceContact[];
  categories: SourceCategory[];
  transactions: SourceTransaction[];
  attachments: SourceAttachment[];
  /** Row counts for other Akaunting tables, for the gap report. */
  otherTableCounts: Record<string, number>;
}

/** The 9 Quidly target category names (unique). */
export const QUIDLY_CATEGORY_NAMES = [
  "Rent received",
  "Other property income",
  "Rent, rates, insurance, ground rents",
  "Property repairs and maintenance",
  "Legal, management, other professional fees",
  "Costs of services provided, including wages",
  "Other allowable property expenses",
  "Mortgage / loan interest",
  "Capital improvements",
] as const;
export type QuidlyCategoryName = (typeof QUIDLY_CATEGORY_NAMES)[number];

export interface CategoryDecision {
  akauntingId: number;
  akauntingName: string;
  akauntingType: string;
  count: number; // transactions using this category
  suggestion: QuidlyCategoryName | null;
  target: QuidlyCategoryName | null;
}

export type PropertyTarget =
  | { createNew: true; name: string; address: string | null }
  | { existingPropertyId: string };

export interface PropertyDecision {
  akauntingCompanyId: number;
  akauntingCompanyName: string;
  target: PropertyTarget;
}

export interface Mapping {
  currency: { assume: string };
  properties: PropertyDecision[];
  categories: CategoryDecision[];
}

/** Output of buildPlan — resolved at apply time to real Quidly ids. */
export interface VendorPayload {
  externalRef: string; // "akaunting:contact:<id>"
  name: string;
  contactDetails: string | null;
}

export interface TransactionPayload {
  externalRef: string; // "akaunting:transaction:<id>"
  akauntingCompanyId: number; // → resolved to propertyId
  date: string; // ISO
  amountPence: number;
  direction: "in" | "out";
  categoryName: QuidlyCategoryName;
  vendorExternalRef: string | null;
  description: string | null;
}

export interface SkippedTransaction {
  id: number;
  reason: string;
}

export interface MigrationPlan {
  vendors: VendorPayload[];
  transactions: TransactionPayload[];
  skipped: SkippedTransaction[];
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/migrate-akaunting/types.ts
git commit -m "feat(migrate): scaffold akaunting migration — deps, scripts, shared types"
```

---

## Task 2: Schema — add `externalRef` to Vendor & Transaction

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260702120000_external_ref/migration.sql`

- [ ] **Step 1: Edit the Prisma schema**

In `prisma/schema.prisma`, add to `model Vendor` (after `notes`):

```prisma
  externalRef       String?       @unique
```

Add to `model Transaction` (after `source`):

```prisma
  externalRef  String?      @unique
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260702120000_external_ref/migration.sql`:

```sql
ALTER TABLE "Vendor" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Vendor_externalRef_key" ON "Vendor"("externalRef");

ALTER TABLE "Transaction" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Transaction_externalRef_key" ON "Transaction"("externalRef");
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: "1 migration ... applied" (20260702120000_external_ref) and client generated.

- [ ] **Step 4: Verify the columns exist**

Run: `npx tsx -e "import Database from 'better-sqlite3'; const d=new Database('dev.db'); console.log(d.prepare('PRAGMA table_info(\"Transaction\")').all().map(c=>c.name).join(','));"`
Expected: output includes `externalRef`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260702120000_external_ref/migration.sql
git commit -m "feat(migrate): add externalRef to Vendor and Transaction for idempotent import"
```

---

## Task 3: `suggest.ts` — pure category auto-suggestion

**Files:**
- Create: `scripts/migrate-akaunting/suggest.ts`
- Test: `scripts/migrate-akaunting/suggest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/migrate-akaunting/suggest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { suggestCategory } from "./suggest";

describe("suggestCategory", () => {
  it("maps rent received income to box 20", () => {
    expect(suggestCategory("Rent received", "income")).toBe("Rent received");
    expect(suggestCategory("Rental income", "income")).toBe("Rent received");
  });
  it("maps other income to box 21", () => {
    expect(suggestCategory("Parking fees", "income")).toBe("Other property income");
  });
  it("maps repairs/maintenance to box 25", () => {
    expect(suggestCategory("Repairs", "expense")).toBe("Property repairs and maintenance");
    expect(suggestCategory("Boiler maintenance", "expense")).toBe("Property repairs and maintenance");
  });
  it("maps mortgage/interest/loan to box 44", () => {
    expect(suggestCategory("Mortgage interest", "expense")).toBe("Mortgage / loan interest");
    expect(suggestCategory("Loan repayment", "expense")).toBe("Mortgage / loan interest");
  });
  it("maps insurance/rates/ground rent/service charge to box 24", () => {
    expect(suggestCategory("Landlord insurance", "expense")).toBe("Rent, rates, insurance, ground rents");
    expect(suggestCategory("Ground rent", "expense")).toBe("Rent, rates, insurance, ground rents");
    expect(suggestCategory("Service charge", "expense")).toBe("Rent, rates, insurance, ground rents");
  });
  it("maps professional fees to box 27", () => {
    expect(suggestCategory("Letting agent fees", "expense")).toBe("Legal, management, other professional fees");
    expect(suggestCategory("Accountant", "expense")).toBe("Legal, management, other professional fees");
  });
  it("maps services/wages/cleaning to box 28", () => {
    expect(suggestCategory("Cleaning", "expense")).toBe("Costs of services provided, including wages");
    expect(suggestCategory("Gardening wages", "expense")).toBe("Costs of services provided, including wages");
  });
  it("maps capital improvements to the capital category", () => {
    expect(suggestCategory("Kitchen renovation", "expense")).toBe("Capital improvements");
    expect(suggestCategory("Capital improvement", "expense")).toBe("Capital improvements");
  });
  it("returns null when not confident", () => {
    expect(suggestCategory("Miscellaneous", "expense")).toBeNull();
    expect(suggestCategory("Sundry", "income")).toBe("Other property income"); // any income → 21
  });
  it("never suggests an income category for an expense", () => {
    expect(suggestCategory("Rent", "expense")).not.toBe("Rent received");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- suggest`
Expected: FAIL ("Failed to resolve import './suggest'").

- [ ] **Step 3: Implement suggest.ts**

Create `scripts/migrate-akaunting/suggest.ts`:

```ts
import type { QuidlyCategoryName } from "./types";

/**
 * Heuristic mapping from an Akaunting category (name + income/expense type) to a
 * Quidly category. Returns null when not confident — a null must be resolved by
 * the user, because a wrong SA105 box means a wrong tax return.
 */
export function suggestCategory(
  name: string,
  type: "income" | "expense",
): QuidlyCategoryName | null {
  const n = name.toLowerCase();
  const has = (...words: string[]) => words.some((w) => n.includes(w));

  if (type === "income") {
    if (has("rent received", "rental income", "rent")) return "Rent received";
    return "Other property income"; // all other income → box 21
  }

  // expense-side ordering: most specific first
  if (has("mortgage", "interest", "loan")) return "Mortgage / loan interest";
  if (has("capital", "improvement", "renovation", "extension")) return "Capital improvements";
  if (has("repair", "maintenance", "fix", "boiler")) return "Property repairs and maintenance";
  if (has("insurance", "rates", "ground rent", "service charge")) {
    return "Rent, rates, insurance, ground rents";
  }
  if (has("legal", "management", "letting agent", "agent", "accountant", "professional", "fee")) {
    return "Legal, management, other professional fees";
  }
  if (has("wage", "cleaning", "gardening", "service")) {
    return "Costs of services provided, including wages";
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- suggest`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-akaunting/suggest.ts scripts/migrate-akaunting/suggest.test.ts
git commit -m "feat(migrate): pure category auto-suggestion heuristics"
```

---

## Task 4: `transform.ts` — decimal→pence conversion

**Files:**
- Create: `scripts/migrate-akaunting/transform.ts`
- Test: `scripts/migrate-akaunting/transform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/migrate-akaunting/transform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decimalStringToPence } from "./transform";

describe("decimalStringToPence", () => {
  it("converts 4dp Akaunting decimals to pence", () => {
    expect(decimalStringToPence("123.4500")).toBe(12345);
  });
  it("handles whole numbers", () => {
    expect(decimalStringToPence("100")).toBe(10000);
    expect(decimalStringToPence("0")).toBe(0);
  });
  it("handles one and two decimal places", () => {
    expect(decimalStringToPence("12.3")).toBe(1230);
    expect(decimalStringToPence("12.34")).toBe(1234);
  });
  it("rounds half up at the pence boundary using the third digit", () => {
    expect(decimalStringToPence("0.125")).toBe(13);
    expect(decimalStringToPence("0.124")).toBe(12);
    expect(decimalStringToPence("1.005")).toBe(101);
  });
  it("handles negatives", () => {
    expect(decimalStringToPence("-50.00")).toBe(-5000);
  });
  it("tolerates surrounding whitespace and leading +", () => {
    expect(decimalStringToPence(" +9.99 ")).toBe(999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transform`
Expected: FAIL ("Failed to resolve import './transform'").

- [ ] **Step 3: Implement decimalStringToPence**

Create `scripts/migrate-akaunting/transform.ts`:

```ts
/**
 * Convert an Akaunting decimal amount string (up to 4dp) to integer pence,
 * without ever going through a float. Rounds half-up at the pence boundary
 * using the third decimal digit.
 */
export function decimalStringToPence(amount: string): number {
  const trimmed = amount.trim();
  const neg = trimmed.startsWith("-");
  const clean = trimmed.replace(/^[-+]/, "");
  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const thirdDigit = frac.charAt(2);
  let pence = Number(whole || "0") * 100 + Number(fracPadded || "0");
  if (thirdDigit !== "" && Number(thirdDigit) >= 5) pence += 1;
  return neg ? -pence : pence;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- transform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-akaunting/transform.ts scripts/migrate-akaunting/transform.test.ts
git commit -m "feat(migrate): float-free decimal-to-pence conversion"
```

---

## Task 5: `transform.ts` — `validateMapping`

**Files:**
- Modify: `scripts/migrate-akaunting/transform.ts`
- Modify: `scripts/migrate-akaunting/transform.test.ts`

Validation rules: (a) every company referenced by a transaction must have a `PropertyDecision`; (b) every category used by a **GBP** transaction must have a non-null `target`. Non-GBP transactions are skipped (not validation errors). Returns a list of human-readable error strings (empty = valid).

- [ ] **Step 1: Write the failing test**

Append to `scripts/migrate-akaunting/transform.test.ts`:

```ts
import { validateMapping } from "./transform";
import type { SourceSnapshot, Mapping } from "./types";

function baseSnapshot(): SourceSnapshot {
  return {
    akauntingVersion: "3.0",
    companies: [{ id: 1, name: "42 Example St" }],
    contacts: [{ id: 7, name: "Acme Plumbing", type: "vendor", email: null, phone: null, address: null }],
    categories: [
      { id: 5, name: "Repairs", type: "expense" },
      { id: 6, name: "Rent", type: "income" },
    ],
    transactions: [
      { id: 100, companyId: 1, type: "expense", categoryId: 5, contactId: 7, paidAt: "2025-06-01T00:00:00.000Z", amount: "150.00", currencyCode: "GBP", description: "Leak" },
      { id: 101, companyId: 1, type: "income", categoryId: 6, contactId: null, paidAt: "2025-06-05T00:00:00.000Z", amount: "800.00", currencyCode: "GBP", description: "June rent" },
    ],
    attachments: [],
    otherTableCounts: {},
  };
}

function baseMapping(): Mapping {
  return {
    currency: { assume: "GBP" },
    properties: [
      { akauntingCompanyId: 1, akauntingCompanyName: "42 Example St", target: { createNew: true, name: "42 Example St", address: null } },
    ],
    categories: [
      { akauntingId: 5, akauntingName: "Repairs", akauntingType: "expense", count: 1, suggestion: "Property repairs and maintenance", target: "Property repairs and maintenance" },
      { akauntingId: 6, akauntingName: "Rent", akauntingType: "income", count: 1, suggestion: "Rent received", target: "Rent received" },
    ],
  };
}

describe("validateMapping", () => {
  it("returns no errors for a complete mapping", () => {
    expect(validateMapping(baseSnapshot(), baseMapping())).toEqual([]);
  });
  it("flags a category used by a GBP transaction with a null target", () => {
    const m = baseMapping();
    m.categories[0].target = null;
    const errors = validateMapping(baseSnapshot(), m);
    expect(errors.some((e) => e.includes("Repairs"))).toBe(true);
  });
  it("does not flag an unmapped category only used by non-GBP transactions", () => {
    const s = baseSnapshot();
    s.transactions[0].currencyCode = "EUR";
    const m = baseMapping();
    m.categories[0].target = null;
    expect(validateMapping(s, m)).toEqual([]);
  });
  it("flags a company with no property decision", () => {
    const m = baseMapping();
    m.properties = [];
    const errors = validateMapping(baseSnapshot(), m);
    expect(errors.some((e) => e.includes("company") || e.includes("42 Example St") || e.includes("1"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transform`
Expected: FAIL ("validateMapping is not a function" / import error).

- [ ] **Step 3: Implement validateMapping**

Append to `scripts/migrate-akaunting/transform.ts`:

```ts
import type { SourceSnapshot, Mapping } from "./types";

function isGbp(currencyCode: string, assume: string): boolean {
  return currencyCode.toUpperCase() === assume.toUpperCase();
}

/** Returns human-readable errors; empty array means the mapping is ready to apply. */
export function validateMapping(snapshot: SourceSnapshot, mapping: Mapping): string[] {
  const errors: string[] = [];
  const assume = mapping.currency.assume;

  // (a) every company used by a transaction needs a property decision
  const mappedCompanyIds = new Set(mapping.properties.map((p) => p.akauntingCompanyId));
  const usedCompanyIds = new Set(snapshot.transactions.map((t) => t.companyId));
  for (const companyId of usedCompanyIds) {
    if (!mappedCompanyIds.has(companyId)) {
      const name = snapshot.companies.find((c) => c.id === companyId)?.name ?? String(companyId);
      errors.push(`No property mapping for Akaunting company "${name}" (id ${companyId}).`);
    }
  }

  // (b) every category used by a GBP transaction needs a target
  const gbpCategoryIds = new Set(
    snapshot.transactions
      .filter((t) => isGbp(t.currencyCode, assume) && t.categoryId != null)
      .map((t) => t.categoryId as number),
  );
  const decisionById = new Map(mapping.categories.map((c) => [c.akauntingId, c]));
  for (const categoryId of gbpCategoryIds) {
    const decision = decisionById.get(categoryId);
    if (!decision || decision.target == null) {
      const name = snapshot.categories.find((c) => c.id === categoryId)?.name ?? String(categoryId);
      errors.push(`Category "${name}" (id ${categoryId}) is used by transactions but has no target — set its "target" in mapping.json.`);
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- transform`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-akaunting/transform.ts scripts/migrate-akaunting/transform.test.ts
git commit -m "feat(migrate): validateMapping — block unmapped categories and companies"
```

---

## Task 6: `transform.ts` — `buildPlan`

**Files:**
- Modify: `scripts/migrate-akaunting/transform.ts`
- Modify: `scripts/migrate-akaunting/transform.test.ts`

`buildPlan` turns a snapshot + a (valid) mapping into a `MigrationPlan`: vendor payloads (deduped, from contacts referenced by kept transactions), transaction payloads (GBP only), and a skipped list (non-GBP, or missing category target as a safety net). Direction: `income`→`in`, `expense`→`out`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/migrate-akaunting/transform.test.ts`:

```ts
import { buildPlan } from "./transform";

describe("buildPlan", () => {
  it("builds vendor and transaction payloads for GBP transactions", () => {
    const plan = buildPlan(baseSnapshot(), baseMapping());
    expect(plan.vendors).toEqual([
      { externalRef: "akaunting:contact:7", name: "Acme Plumbing", contactDetails: null },
    ]);
    expect(plan.transactions).toEqual([
      {
        externalRef: "akaunting:transaction:100",
        akauntingCompanyId: 1,
        date: "2025-06-01T00:00:00.000Z",
        amountPence: 15000,
        direction: "out",
        categoryName: "Property repairs and maintenance",
        vendorExternalRef: "akaunting:contact:7",
        description: "Leak",
      },
      {
        externalRef: "akaunting:transaction:101",
        akauntingCompanyId: 1,
        date: "2025-06-05T00:00:00.000Z",
        amountPence: 80000,
        direction: "in",
        categoryName: "Rent received",
        vendorExternalRef: null,
        description: "June rent",
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips non-GBP transactions with a reason and omits their vendor-only references", () => {
    const s = baseSnapshot();
    s.transactions[0].currencyCode = "EUR";
    const plan = buildPlan(s, baseMapping());
    expect(plan.transactions.map((t) => t.externalRef)).toEqual(["akaunting:transaction:101"]);
    expect(plan.skipped).toEqual([{ id: 100, reason: "non-GBP currency EUR" }]);
    // contact 7 was only used by the skipped txn → not created
    expect(plan.vendors).toEqual([]);
  });

  it("builds contactDetails from email/phone/address when present", () => {
    const s = baseSnapshot();
    s.contacts[0] = { id: 7, name: "Acme Plumbing", type: "vendor", email: "a@b.com", phone: "0123", address: "1 High St" };
    const plan = buildPlan(s, baseMapping());
    expect(plan.vendors[0].contactDetails).toBe("a@b.com | 0123 | 1 High St");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- transform`
Expected: FAIL ("buildPlan is not a function").

- [ ] **Step 3: Implement buildPlan**

Append to `scripts/migrate-akaunting/transform.ts` (add the extra type imports to the existing `import type { SourceSnapshot, Mapping } ...` line):

```ts
import type {
  MigrationPlan,
  TransactionPayload,
  VendorPayload,
  SkippedTransaction,
  QuidlyCategoryName,
} from "./types";

function contactDetails(c: { email: string | null; phone: string | null; address: string | null }): string | null {
  const parts = [c.email, c.phone, c.address].filter((p): p is string => !!p && p.trim() !== "");
  return parts.length ? parts.join(" | ") : null;
}

/** Build the migration plan. Assumes validateMapping returned no errors. */
export function buildPlan(snapshot: SourceSnapshot, mapping: Mapping): MigrationPlan {
  const assume = mapping.currency.assume;
  const targetByCategoryId = new Map<number, QuidlyCategoryName | null>(
    mapping.categories.map((c) => [c.akauntingId, c.target]),
  );

  const transactions: TransactionPayload[] = [];
  const skipped: SkippedTransaction[] = [];
  const usedContactIds = new Set<number>();

  for (const t of snapshot.transactions) {
    if (!isGbp(t.currencyCode, assume)) {
      skipped.push({ id: t.id, reason: `non-GBP currency ${t.currencyCode}` });
      continue;
    }
    const target = t.categoryId != null ? targetByCategoryId.get(t.categoryId) : null;
    if (!target) {
      skipped.push({ id: t.id, reason: `no category target for category id ${t.categoryId}` });
      continue;
    }
    const vendorExternalRef = t.contactId != null ? `akaunting:contact:${t.contactId}` : null;
    if (t.contactId != null) usedContactIds.add(t.contactId);
    transactions.push({
      externalRef: `akaunting:transaction:${t.id}`,
      akauntingCompanyId: t.companyId,
      date: t.paidAt,
      amountPence: decimalStringToPence(t.amount),
      direction: t.type === "income" ? "in" : "out",
      categoryName: target,
      vendorExternalRef,
      description: t.description,
    });
  }

  const vendors: VendorPayload[] = snapshot.contacts
    .filter((c) => usedContactIds.has(c.id))
    .map((c) => ({
      externalRef: `akaunting:contact:${c.id}`,
      name: c.name,
      contactDetails: contactDetails(c),
    }));

  return { vendors, transactions, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- transform`
Expected: PASS (all transform tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-akaunting/transform.ts scripts/migrate-akaunting/transform.test.ts
git commit -m "feat(migrate): buildPlan — GBP transactions, deduped vendors, skip list"
```

---

## Task 7: `report.ts` — human report + gap analysis

**Files:**
- Create: `scripts/migrate-akaunting/report.ts`
- Test: `scripts/migrate-akaunting/report.test.ts`

`buildReport(snapshot, mapping)` returns a Markdown string covering: counts, category mapping table (with unmapped flagged), skipped/non-GBP list, attachments note, and a gap section derived from `snapshot.otherTableCounts` (known Akaunting feature tables with a >0 count that Quidly can't represent).

- [ ] **Step 1: Write the failing test**

Create `scripts/migrate-akaunting/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import type { SourceSnapshot, Mapping } from "./types";

function snapshot(): SourceSnapshot {
  return {
    akauntingVersion: "3.0",
    companies: [{ id: 1, name: "42 Example St" }],
    contacts: [{ id: 7, name: "Acme", type: "vendor", email: null, phone: null, address: null }],
    categories: [
      { id: 5, name: "Repairs", type: "expense" },
      { id: 9, name: "Misc", type: "expense" },
    ],
    transactions: [
      { id: 100, companyId: 1, type: "expense", categoryId: 5, contactId: 7, paidAt: "2025-06-01T00:00:00.000Z", amount: "150.00", currencyCode: "GBP", description: null },
      { id: 200, companyId: 1, type: "expense", categoryId: 9, contactId: null, paidAt: "2025-06-02T00:00:00.000Z", amount: "10.00", currencyCode: "EUR", description: null },
    ],
    attachments: [{ transactionId: 100, filename: "receipt.pdf", directory: null }],
    otherTableCounts: { documents: 4, items: 12, accounts: 2, taxes: 0 },
  };
}

function mapping(): Mapping {
  return {
    currency: { assume: "GBP" },
    properties: [{ akauntingCompanyId: 1, akauntingCompanyName: "42 Example St", target: { createNew: true, name: "42 Example St", address: null } }],
    categories: [
      { akauntingId: 5, akauntingName: "Repairs", akauntingType: "expense", count: 1, suggestion: "Property repairs and maintenance", target: "Property repairs and maintenance" },
      { akauntingId: 9, akauntingName: "Misc", akauntingType: "expense", count: 1, suggestion: null, target: null },
    ],
  };
}

describe("buildReport", () => {
  const md = buildReport(snapshot(), mapping());
  it("summarises counts", () => {
    expect(md).toContain("Transactions: 2");
    expect(md).toContain("Vendors/contacts: 1");
  });
  it("flags unmapped categories", () => {
    expect(md).toContain("Misc");
    expect(md).toMatch(/unmapped|NEEDS MAPPING/i);
  });
  it("lists non-GBP skipped transactions", () => {
    expect(md).toContain("EUR");
    expect(md).toContain("200");
  });
  it("notes attachments cannot be read from the dump alone", () => {
    expect(md).toMatch(/attachment/i);
    expect(md).toContain("1");
  });
  it("reports gaps for feature tables with rows, not empty ones", () => {
    expect(md).toContain("documents");
    expect(md).toContain("items");
    expect(md).not.toContain("taxes"); // 0 rows → not a gap
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- report`
Expected: FAIL ("Failed to resolve import './report'").

- [ ] **Step 3: Implement report.ts**

Create `scripts/migrate-akaunting/report.ts`:

```ts
import type { SourceSnapshot, Mapping } from "./types";
import { buildPlan, validateMapping } from "./transform";

/** Known Akaunting feature tables Quidly has no home for, with an explanation. */
const GAP_EXPLANATIONS: Record<string, string> = {
  documents: "Invoices/bills (Akaunting 3.x) — Quidly tracks money movements, not open receivables/payables.",
  invoices: "Invoices (Akaunting 2.x) — Quidly tracks received money, not open receivables.",
  bills: "Bills (Akaunting 2.x) — Quidly tracks paid money, not open payables.",
  items: "Product/service catalogue — no equivalent in Quidly.",
  accounts: "Bank accounts / reconciliation — Quidly has no multi-account or bank-rec model.",
  transfers: "Inter-account transfers — no multi-account model in Quidly.",
  taxes: "Tax/VAT rates — Quidly computes UK property tax from categories, not stored rates.",
  recurring: "Recurring templates — Quidly has its own recurring rules; Akaunting's are not imported.",
  reconciliations: "Bank reconciliations — no equivalent in Quidly.",
};

export function buildReport(snapshot: SourceSnapshot, mapping: Mapping): string {
  const errors = validateMapping(snapshot, mapping);
  const plan = buildPlan(snapshot, mapping);
  const nonGbp = plan.skipped.filter((s) => s.reason.startsWith("non-GBP"));

  const lines: string[] = [];
  lines.push("# Akaunting → Quidly migration report", "");
  lines.push(`Akaunting version: ${snapshot.akauntingVersion ?? "unknown"}`, "");

  lines.push("## Summary", "");
  lines.push(`- Companies (→ properties): ${snapshot.companies.length}`);
  lines.push(`- Transactions: ${snapshot.transactions.length} (will import ${plan.transactions.length}, skip ${plan.skipped.length})`);
  lines.push(`- Vendors/contacts: ${snapshot.contacts.length} (will create ${plan.vendors.length} used by imported transactions)`);
  lines.push(`- Categories: ${snapshot.categories.length}`);
  lines.push("");

  lines.push("## Category mapping", "");
  lines.push("| Akaunting category | Type | Txns | → Quidly category |");
  lines.push("|---|---|---|---|");
  for (const c of mapping.categories) {
    const target = c.target ?? "**NEEDS MAPPING (unmapped)**";
    lines.push(`| ${c.akauntingName} | ${c.akauntingType} | ${c.count} | ${target} |`);
  }
  lines.push("");

  if (errors.length) {
    lines.push("## ⚠ Blocking issues (fix mapping.json before apply)", "");
    for (const e of errors) lines.push(`- ${e}`);
    lines.push("");
  }

  if (nonGbp.length) {
    lines.push("## Non-GBP transactions (skipped)", "");
    for (const s of nonGbp) lines.push(`- Transaction ${s.id}: ${s.reason}`);
    lines.push("");
  }

  lines.push("## Attachments", "");
  lines.push(
    `${snapshot.attachments.length} attachment reference(s) found. Files are not in the SQL dump — ` +
      "re-run apply with `--attachments-dir <path-to-akaunting-storage>` to copy them, or re-upload manually.",
    "",
  );

  const gaps = Object.entries(snapshot.otherTableCounts).filter(([, n]) => n > 0);
  lines.push("## What's missing (not migrated)", "");
  if (gaps.length === 0) {
    lines.push("No Akaunting features outside Quidly's model were found.", "");
  } else {
    for (const [table, n] of gaps) {
      const why = GAP_EXPLANATIONS[table] ?? "No equivalent in Quidly.";
      lines.push(`- **${table}** (${n} rows): ${why}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- report`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-akaunting/report.ts scripts/migrate-akaunting/report.test.ts
git commit -m "feat(migrate): human report with category table and gap analysis"
```

---

## Task 8: Introspect the real dump + `mariadb.ts` + `read.ts`

> This task needs the real Akaunting dump and Docker. It is sequenced here (after the pure core) deliberately: the reader is validated against real data. If the dump is absent, obtain it first (`./akaunting-migration/dump.sql`).

**Files:**
- Create: `scripts/migrate-akaunting/mariadb.ts`
- Create: `scripts/migrate-akaunting/read.ts`

- [ ] **Step 1: Confirm Docker (schema already introspected)**

The controller already introspected this dump; the confirmed schema is recorded at the end of this task and baked into the Step 3 reader (prefix `akk_`, company name in `akk_settings`, media path `directory/filename.extension`). The reader detects the prefix dynamically, so it also works on installs with no prefix.

Confirm Docker is available:

Run: `docker --version`
Expected: prints a Docker version. If not, install/start Docker before continuing (the pure tasks 1–7, 10 don't need it, but the reader does).

Optional re-verification (starts MariaDB, loads dump, lists tables — note the `akk_` prefix):

```bash
docker rm -f quidly-akaunting 2>/dev/null; docker run -d --name quidly-akaunting -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=akaunting mariadb:11
until docker exec quidly-akaunting mariadb -uroot -proot -e "SELECT 1" >/dev/null 2>&1; do sleep 1; done
docker exec -i quidly-akaunting mariadb -uroot -proot akaunting < ./akaunting-migration/dump.sql
docker exec quidly-akaunting mariadb -uroot -proot akaunting -e "SHOW TABLES; SHOW COLUMNS FROM akk_transactions;"
docker rm -f quidly-akaunting
```

- [ ] **Step 2: Implement mariadb.ts (Docker lifecycle)**

Create `scripts/migrate-akaunting/mariadb.ts`:

```ts
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTAINER = "quidly-akaunting-migrate";
const IMAGE = "mariadb:11";
const DB = "akaunting";
const PW = "root";

export interface MariaHandle {
  query: (sql: string) => Promise<unknown>;
  stop: () => void;
}

function docker(args: string[], opts: { input?: Buffer } = {}) {
  const res = spawnSync("docker", args, { input: opts.input, encoding: "buffer" });
  if (res.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed: ${res.stderr?.toString() ?? ""}`);
  }
  return res.stdout;
}

/** Start MariaDB, wait until ready, load the dump. Caller must call stop(). */
export async function startMariaWithDump(dumpPath: string): Promise<{ mysqlConfig: object; stop: () => void }> {
  // Clean any stale container from a previous interrupted run.
  spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });
  try {
    execFileSync("docker", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("Docker is required for `analyse` but was not found. Install/start Docker and retry.");
  }
  docker(["run", "-d", "--name", CONTAINER, "-p", "13306:3306",
    "-e", `MARIADB_ROOT_PASSWORD=${PW}`, "-e", `MARIADB_DATABASE=${DB}`, IMAGE]);

  const stop = () => spawnSync("docker", ["rm", "-f", CONTAINER], { stdio: "ignore" });

  // Wait until the server answers.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const res = spawnSync("docker", ["exec", CONTAINER, "mariadb", `-uroot`, `-p${PW}`, "-e", "SELECT 1"], { stdio: "ignore" });
    if (res.status === 0) break;
    await new Promise((r) => setTimeout(r, 1000));
    if (Date.now() >= deadline) { stop(); throw new Error("MariaDB did not become ready in time."); }
  }

  // Load the dump.
  const dump = readFileSync(dumpPath);
  const load = spawnSync("docker", ["exec", "-i", CONTAINER, "mariadb", `-uroot`, `-p${PW}`, DB], { input: dump });
  if (load.status !== 0) { stop(); throw new Error(`Loading dump failed: ${load.stderr?.toString() ?? ""}`); }

  return {
    mysqlConfig: { host: "127.0.0.1", port: 13306, user: "root", password: PW, database: DB },
    stop,
  };
}
```

- [ ] **Step 3: Implement read.ts (queries → SourceSnapshot)**

Create `scripts/migrate-akaunting/read.ts` (adjust column/table names to match Step 1 findings):

```ts
import mysql from "mysql2/promise";
import type {
  SourceSnapshot, SourceCompany, SourceContact, SourceCategory,
  SourceTransaction, SourceAttachment,
} from "./types";

/** Logical (unprefixed) Akaunting feature tables Quidly has no home for. */
const FEATURE_TABLES = ["documents", "invoices", "bills", "items", "accounts", "transfers", "taxes", "recurring", "reconciliations"];

export async function readSnapshot(mysqlConfig: object): Promise<SourceSnapshot> {
  const conn = await mysql.createConnection(mysqlConfig as mysql.ConnectionOptions);
  try {
    // All base tables in this schema.
    const [tblRows] = await conn.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    );
    const tableNames = (tblRows as { t: string }[]).map((r) => r.t);

    // Akaunting's table prefix is configurable (e.g. "akk_" here, or "" ). Detect it
    // from the transactions table so the reader works on any install.
    const txnTable = tableNames.find((t) => t.endsWith("transactions"));
    if (!txnTable) throw new Error("This dump has no `transactions` table — is it an Akaunting database?");
    const prefix = txnTable.slice(0, txnTable.length - "transactions".length);
    const T = (name: string) => `${prefix}${name}`;
    const logical = new Set(tableNames.map((t) => (t.startsWith(prefix) ? t.slice(prefix.length) : t)));
    const need = (name: string) => {
      if (!logical.has(name)) throw new Error(`Expected Akaunting table "${prefix}${name}" is missing — unsupported Akaunting version?`);
    };
    need("transactions"); need("contacts"); need("categories");

    // Companies: the companies table has no name column — the name lives in settings key "company.name".
    const [coRows] = await conn.query(`SELECT id FROM \`${T("companies")}\` WHERE deleted_at IS NULL`);
    const companies: SourceCompany[] = (coRows as { id: number }[]).map((r) => ({ id: r.id, name: String(r.id) }));
    if (logical.has("settings")) {
      const [rows] = await conn.query(
        `SELECT company_id, value FROM \`${T("settings")}\` WHERE \`key\` = 'company.name'`,
      );
      const byId = new Map((rows as { company_id: number; value: string }[]).map((r) => [r.company_id, r.value]));
      for (const c of companies) c.name = byId.get(c.id) ?? c.name;
    }

    const [contactRows] = await conn.query(
      `SELECT id, name, type, email, phone, address FROM \`${T("contacts")}\` WHERE deleted_at IS NULL`,
    );
    const contacts: SourceContact[] = (contactRows as any[]).map((r) => ({
      id: r.id, name: r.name, type: r.type,
      email: r.email ?? null, phone: r.phone ?? null, address: r.address ?? null,
    }));

    const [catRows] = await conn.query(`SELECT id, name, type FROM \`${T("categories")}\` WHERE deleted_at IS NULL`);
    const categories: SourceCategory[] = (catRows as any[]).map((r) => ({ id: r.id, name: r.name, type: r.type }));

    // Only real income/expense transactions (excludes '*-transfer' pseudo-types).
    const [txnRows] = await conn.query(
      `SELECT id, company_id, type, category_id, contact_id, paid_at, amount, currency_code, description ` +
        `FROM \`${T("transactions")}\` WHERE deleted_at IS NULL AND type IN ('income','expense')`,
    );
    const transactions: SourceTransaction[] = (txnRows as any[]).map((r) => ({
      id: r.id, companyId: r.company_id, type: r.type,
      categoryId: r.category_id ?? null, contactId: r.contact_id ?? null,
      paidAt: new Date(r.paid_at).toISOString(),
      amount: String(r.amount), currencyCode: r.currency_code, description: r.description ?? null,
    }));

    // Attachments via media + mediables (mediable a Transaction). laravel-mediable stores
    // the file at `<disk>/<directory>/<filename>.<extension>`.
    let attachments: SourceAttachment[] = [];
    if (logical.has("media") && logical.has("mediables")) {
      const [attRows] = await conn.query(
        `SELECT mb.mediable_id AS transactionId, m.filename AS filename, m.extension AS extension, m.directory AS directory ` +
          `FROM \`${T("mediables")}\` mb JOIN \`${T("media")}\` m ON m.id = mb.media_id ` +
          `WHERE mb.mediable_type LIKE '%Transaction%'`,
      );
      attachments = (attRows as any[]).map((r) => ({
        transactionId: r.transactionId,
        filename: r.extension ? `${r.filename}.${r.extension}` : r.filename,
        directory: r.directory ?? null,
      }));
    }

    // Gap report: actual COUNT(*) for feature tables that exist (table_rows is only an estimate in InnoDB).
    const otherTableCounts: Record<string, number> = {};
    for (const name of FEATURE_TABLES) {
      if (!logical.has(name)) continue;
      const [cntRows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${T(name)}\``);
      otherTableCounts[name] = Number((cntRows as { n: number }[])[0]?.n ?? 0);
    }

    let akauntingVersion: string | null = null;
    if (logical.has("settings")) {
      const [vRows] = await conn.query(`SELECT value FROM \`${T("settings")}\` WHERE \`key\` = 'app.version' LIMIT 1`);
      akauntingVersion = (vRows as any[])[0]?.value ?? null;
    }

    return { akauntingVersion, companies, contacts, categories, transactions, attachments, otherTableCounts };
  } finally {
    await conn.end();
  }
}
```

**This dump's real schema (confirmed by introspection):** prefix `akk_`; `akk_companies` has no `name` (name is in `akk_settings` key `company.name` = "Ash Rentals"); populated `akk_transactions`/`akk_contacts`/`akk_categories`/`akk_accounts`; empty `akk_documents`/`akk_invoices`/`akk_bills`/`akk_items`. Transaction cols: `id, company_id, type, paid_at, amount, currency_code, currency_rate, category_id, contact_id, description, deleted_at`.

- [ ] **Step 4: Smoke-test the reader against the real dump**

Run:

```bash
npx tsx -e "import {startMariaWithDump} from './scripts/migrate-akaunting/mariadb'; import {readSnapshot} from './scripts/migrate-akaunting/read'; (async()=>{const {mysqlConfig,stop}=await startMariaWithDump('./akaunting-migration/dump.sql'); try{const s=await readSnapshot(mysqlConfig); console.log(JSON.stringify({companies:s.companies.length,contacts:s.contacts.length,categories:s.categories.length,transactions:s.transactions.length,attachments:s.attachments.length,other:s.otherTableCounts},null,2));} finally{stop();}})()"
```

Expected: sensible non-zero counts that match your Akaunting install (cross-check the transaction count against Akaunting's UI or a `SELECT COUNT(*)`).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-akaunting/mariadb.ts scripts/migrate-akaunting/read.ts
git commit -m "feat(migrate): MariaDB dump loader and mysql2 reader → SourceSnapshot"
```

---

## Task 9: `analyse.ts` — orchestrate the analyse phase

**Files:**
- Create: `scripts/migrate-akaunting/analyse.ts`

Reads the dump via MariaDB, builds `mapping.json` (with suggestions + per-category counts), writes `source.json` and `report.md`. Never overwrites an existing `mapping.json` (so re-running `analyse` doesn't clobber the user's edits) unless `--force`.

- [ ] **Step 1: Implement analyse.ts**

Create `scripts/migrate-akaunting/analyse.ts`:

```ts
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startMariaWithDump } from "./mariadb";
import { readSnapshot } from "./read";
import { suggestCategory } from "./suggest";
import { buildReport } from "./report";
import type { Mapping, CategoryDecision, PropertyDecision, SourceSnapshot } from "./types";

const OUT_DIR = "akaunting-migration";

function buildInitialMapping(snapshot: SourceSnapshot): Mapping {
  const counts = new Map<number, number>();
  for (const t of snapshot.transactions) {
    if (t.categoryId != null) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  }
  const categories: CategoryDecision[] = snapshot.categories
    .filter((c) => c.type === "income" || c.type === "expense")
    .map((c) => {
      const suggestion = suggestCategory(c.name, c.type as "income" | "expense");
      return {
        akauntingId: c.id, akauntingName: c.name, akauntingType: c.type,
        count: counts.get(c.id) ?? 0, suggestion, target: suggestion,
      };
    });
  const properties: PropertyDecision[] = snapshot.companies.map((c) => ({
    akauntingCompanyId: c.id, akauntingCompanyName: c.name,
    target: { createNew: true, name: c.name, address: null },
  }));
  return { currency: { assume: "GBP" }, properties, categories };
}

export async function analyse(dumpPath: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!existsSync(dumpPath)) throw new Error(`Dump not found: ${dumpPath}`);
  mkdirSync(OUT_DIR, { recursive: true });

  const { mysqlConfig, stop } = await startMariaWithDump(dumpPath);
  let snapshot: SourceSnapshot;
  try {
    snapshot = await readSnapshot(mysqlConfig);
  } finally {
    stop();
  }

  writeFileSync(join(OUT_DIR, "source.json"), JSON.stringify(snapshot, null, 2));

  const mappingPath = join(OUT_DIR, "mapping.json");
  if (existsSync(mappingPath) && !opts.force) {
    console.log(`Kept existing ${mappingPath} (use --force to regenerate).`);
  } else {
    writeFileSync(mappingPath, JSON.stringify(buildInitialMapping(snapshot), null, 2));
    console.log(`Wrote ${mappingPath}.`);
  }

  const currentMapping: Mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  writeFileSync(join(OUT_DIR, "report.md"), buildReport(snapshot, currentMapping));

  console.log(`Analyse complete. Review ${OUT_DIR}/report.md and ${mappingPath}, then run apply.`);
}
```

- [ ] **Step 2: Run analyse end-to-end**

Run: `npm run migrate:akaunting:analyse -- ./akaunting-migration/dump.sql`
Expected: creates `akaunting-migration/source.json`, `mapping.json`, `report.md`; prints "Analyse complete." (This also exercises the CLI dispatch from Task 11 — if running before Task 11, invoke via the tsx one-liner `npx tsx -e "import {analyse} from './scripts/migrate-akaunting/analyse'; analyse('./akaunting-migration/dump.sql')"`.)

- [ ] **Step 3: Eyeball the report**

Run: `sed -n '1,60p' akaunting-migration/report.md` (or open it). Confirm counts, category suggestions, gap list look right.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-akaunting/analyse.ts
git commit -m "feat(migrate): analyse phase — snapshot, mapping.json, report.md"
```

---

## Task 10: `apply.ts` — write into Quidly (idempotent, dry-run, attachments)

**Files:**
- Create: `scripts/migrate-akaunting/apply.ts`
- Test: `scripts/migrate-akaunting/apply.test.ts`

`applyPlan(prisma, snapshot, mapping, opts)` resolves the plan against a live Quidly DB: create/find properties per `PropertyDecision`, upsert vendors by `externalRef`, look up categories by name, insert transactions by `externalRef` (skip existing). Wrapped in `prisma.$transaction`. `dryRun` computes and returns the counts without writing. Attachments copied only when `attachmentsDir` given and the file exists.

- [ ] **Step 1: Write the failing test**

Create `scripts/migrate-akaunting/apply.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import Database from "better-sqlite3";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { applyPlan } from "./apply";
import type { SourceSnapshot, Mapping } from "./types";

const TMP = join(process.cwd(), "akaunting-migration", "test-apply.db");
let prisma: PrismaClient;

beforeAll(async () => {
  rmSync(TMP, { force: true });
  // Build schema by executing every migration SQL in order.
  const raw = new Database(TMP);
  const migDir = join(process.cwd(), "prisma", "migrations");
  for (const dir of readdirSync(migDir).filter((d) => d.match(/^\d/)).sort()) {
    raw.exec(readFileSync(join(migDir, dir, "migration.sql"), "utf8"));
  }
  // Seed the 9 categories the transform targets.
  const cats: [string, string, string | null][] = [
    ["Rent received", "income", "20"],
    ["Property repairs and maintenance", "expense", "25"],
  ];
  for (const [name, kind, box] of cats) {
    raw.prepare("INSERT INTO Category (id, name, kind, sa105Box, allowable) VALUES (?,?,?,?,1)")
      .run(name, name, kind, box);
  }
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${TMP}` }) });
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(TMP, { force: true });
});

function snapshot(): SourceSnapshot {
  return {
    akauntingVersion: "3.0",
    companies: [{ id: 1, name: "42 Example St" }],
    contacts: [{ id: 7, name: "Acme", type: "vendor", email: null, phone: null, address: null }],
    categories: [
      { id: 5, name: "Repairs", type: "expense" },
      { id: 6, name: "Rent", type: "income" },
    ],
    transactions: [
      { id: 100, companyId: 1, type: "expense", categoryId: 5, contactId: 7, paidAt: "2025-06-01T00:00:00.000Z", amount: "150.00", currencyCode: "GBP", description: "Leak" },
      { id: 101, companyId: 1, type: "income", categoryId: 6, contactId: null, paidAt: "2025-06-05T00:00:00.000Z", amount: "800.00", currencyCode: "GBP", description: "Rent" },
    ],
    attachments: [],
    otherTableCounts: {},
  };
}

function mapping(): Mapping {
  return {
    currency: { assume: "GBP" },
    properties: [{ akauntingCompanyId: 1, akauntingCompanyName: "42 Example St", target: { createNew: true, name: "42 Example St", address: null } }],
    categories: [
      { akauntingId: 5, akauntingName: "Repairs", akauntingType: "expense", count: 1, suggestion: "Property repairs and maintenance", target: "Property repairs and maintenance" },
      { akauntingId: 6, akauntingName: "Rent", akauntingType: "income", count: 1, suggestion: "Rent received", target: "Rent received" },
    ],
  };
}

describe("applyPlan", () => {
  it("dry-run writes nothing", async () => {
    const res = await applyPlan(prisma, snapshot(), mapping(), { dryRun: true });
    expect(res.transactionsCreated).toBe(2);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("creates property, vendor and transactions", async () => {
    const res = await applyPlan(prisma, snapshot(), mapping(), {});
    expect(res.transactionsCreated).toBe(2);
    expect(await prisma.property.count()).toBe(1);
    expect(await prisma.vendor.count()).toBe(1);
    const rent = await prisma.transaction.findUnique({ where: { externalRef: "akaunting:transaction:101" } });
    expect(rent?.amountPence).toBe(80000);
    expect(rent?.direction).toBe("in");
  });

  it("is idempotent — a second apply creates nothing new", async () => {
    const res = await applyPlan(prisma, snapshot(), mapping(), {});
    expect(res.transactionsCreated).toBe(0);
    expect(await prisma.transaction.count()).toBe(2);
    expect(await prisma.property.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apply`
Expected: FAIL ("Failed to resolve import './apply'").

- [ ] **Step 3: Implement apply.ts**

Create `scripts/migrate-akaunting/apply.ts`:

```ts
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { Mapping, SourceSnapshot, PropertyDecision } from "./types";
import { buildPlan, validateMapping } from "./transform";

export interface ApplyOptions {
  dryRun?: boolean;
  attachmentsDir?: string;
  uploadsDir?: string; // where Quidly stores attachment files; default "uploads"
}

export interface ApplyResult {
  propertiesCreated: number;
  vendorsCreated: number;
  transactionsCreated: number;
  attachmentsCopied: number;
  skipped: number;
}

async function resolveProperty(prisma: PrismaClient, d: PropertyDecision): Promise<string> {
  if ("existingPropertyId" in d.target) return d.target.existingPropertyId;
  const existing = await prisma.property.findFirst({ where: { name: d.target.name } });
  if (existing) return existing.id;
  const created = await prisma.property.create({
    data: { name: d.target.name, address: d.target.address ?? null },
  });
  return created.id;
}

export async function applyPlan(
  prisma: PrismaClient,
  snapshot: SourceSnapshot,
  mapping: Mapping,
  opts: ApplyOptions,
): Promise<ApplyResult> {
  const errors = validateMapping(snapshot, mapping);
  if (errors.length) {
    throw new Error("Mapping is not ready to apply:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }
  const plan = buildPlan(snapshot, mapping);
  const result: ApplyResult = {
    propertiesCreated: 0, vendorsCreated: 0, transactionsCreated: 0,
    attachmentsCopied: 0, skipped: plan.skipped.length,
  };

  if (opts.dryRun) {
    // Count what would be created without touching the DB.
    result.propertiesCreated = mapping.properties.filter((p) => "createNew" in p.target).length;
    result.vendorsCreated = plan.vendors.length;
    result.transactionsCreated = plan.transactions.length;
    return result;
  }

  await prisma.$transaction(async (tx) => {
    // Properties (by company id).
    const propertyIdByCompany = new Map<number, string>();
    for (const d of mapping.properties) {
      const before = await tx.property.count();
      const id = await resolveProperty(tx as unknown as PrismaClient, d);
      if ((await tx.property.count()) > before) result.propertiesCreated++;
      propertyIdByCompany.set(d.akauntingCompanyId, id);
    }

    // Vendors (upsert by externalRef).
    const vendorIdByRef = new Map<string, string>();
    for (const v of plan.vendors) {
      const existing = await tx.vendor.findUnique({ where: { externalRef: v.externalRef } });
      if (existing) { vendorIdByRef.set(v.externalRef, existing.id); continue; }
      const created = await tx.vendor.create({
        data: { name: v.name, contactDetails: v.contactDetails, externalRef: v.externalRef },
      });
      vendorIdByRef.set(v.externalRef, created.id);
      result.vendorsCreated++;
    }

    // Categories (by name).
    const categoryIdByName = new Map<string, string>();
    for (const name of new Set(plan.transactions.map((t) => t.categoryName))) {
      const cat = await tx.category.findUnique({ where: { name } });
      if (!cat) throw new Error(`Quidly category "${name}" not found — run \`npm run db:seed\` first.`);
      categoryIdByName.set(name, cat.id);
    }

    // Transactions (insert by externalRef; skip existing).
    for (const t of plan.transactions) {
      const exists = await tx.transaction.findUnique({ where: { externalRef: t.externalRef } });
      if (exists) continue;
      await tx.transaction.create({
        data: {
          propertyId: propertyIdByCompany.get(t.akauntingCompanyId)!,
          date: new Date(t.date),
          amountPence: t.amountPence,
          direction: t.direction,
          categoryId: categoryIdByName.get(t.categoryName)!,
          vendorId: t.vendorExternalRef ? vendorIdByRef.get(t.vendorExternalRef) ?? null : null,
          description: t.description,
          source: "imported",
          externalRef: t.externalRef,
        },
      });
      result.transactionsCreated++;
    }
  });

  // Attachments (best-effort, outside the txn — file IO only).
  if (opts.attachmentsDir) {
    const uploads = opts.uploadsDir ?? "uploads";
    mkdirSync(uploads, { recursive: true });
    for (const a of snapshot.attachments) {
      const src = join(opts.attachmentsDir, a.directory ?? "", a.filename);
      if (!existsSync(src)) continue;
      const txn = await prisma.transaction.findUnique({ where: { externalRef: `akaunting:transaction:${a.transactionId}` } });
      if (!txn) continue;
      const dest = join(uploads, `${a.transactionId}-${basename(a.filename)}`);
      copyFileSync(src, dest);
      const att = await prisma.attachment.create({ data: { filePath: dest, originalName: a.filename } });
      await prisma.transaction.update({ where: { id: txn.id }, data: { attachmentId: att.id } });
      result.attachmentsCopied++;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apply`
Expected: PASS (dry-run writes nothing; create; idempotent).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-akaunting/apply.ts scripts/migrate-akaunting/apply.test.ts
git commit -m "feat(migrate): apply phase — idempotent writes, dry-run, attachments"
```

---

## Task 11: `index.ts` — CLI entry & dispatch

**Files:**
- Create: `scripts/migrate-akaunting/index.ts`

- [ ] **Step 1: Implement index.ts**

Create `scripts/migrate-akaunting/index.ts`:

```ts
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { analyse } from "./analyse";
import { applyPlan } from "./apply";
import type { Mapping, SourceSnapshot } from "./types";

const OUT_DIR = "akaunting-migration";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const command = process.argv[2];

  if (command === "analyse") {
    const dump = process.argv[3];
    if (!dump || dump.startsWith("--")) throw new Error("Usage: analyse <dump.sql> [--force]");
    await analyse(dump, { force: hasFlag("force") });
    return;
  }

  if (command === "apply") {
    const snapshotPath = join(OUT_DIR, "source.json");
    const mappingPath = join(OUT_DIR, "mapping.json");
    if (!existsSync(snapshotPath) || !existsSync(mappingPath)) {
      throw new Error(`Run analyse first — missing ${snapshotPath} or ${mappingPath}.`);
    }
    const snapshot: SourceSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const mapping: Mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
    const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl }) });
    try {
      const res = await applyPlan(prisma, snapshot, mapping, {
        dryRun: hasFlag("dry-run"),
        attachmentsDir: flag("attachments-dir"),
      });
      console.log(`${hasFlag("dry-run") ? "[dry-run] " : ""}Properties: ${res.propertiesCreated}, Vendors: ${res.vendorsCreated}, Transactions: ${res.transactionsCreated}, Attachments: ${res.attachmentsCopied}, Skipped: ${res.skipped}`);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  throw new Error(`Unknown command "${command ?? ""}". Use: analyse <dump.sql> | apply [--dry-run] [--attachments-dir <path>]`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test the CLI dispatch**

Run: `npm run migrate:akaunting:apply -- --dry-run`
Expected (if analyse has been run): prints `[dry-run] Properties: … Transactions: …`. If analyse hasn't run, prints the "Run analyse first" error and exits 1 — both acceptable.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-akaunting/index.ts
git commit -m "feat(migrate): CLI entry — analyse/apply dispatch with flags"
```

---

## Task 12: Docs, ignore artefacts, full verification

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Ignore migration artefacts**

Append to `.gitignore`:

```
# Akaunting migration working files (may contain financial data)
/akaunting-migration/
```

- [ ] **Step 2: Document the utility in the README**

Add a section to `README.md` (after the local-dev section):

````markdown
## Migrating from Akaunting

Import your existing Akaunting data (transactions, vendors, categories) into Quidly.

**Prerequisites:** Docker (for the analyse step) and a MySQL dump of your Akaunting database.

```bash
# 1. Analyse the dump — loads it into a throwaway MariaDB and writes a review pack
npm run migrate:akaunting:analyse -- ./akaunting-migration/dump.sql

# 2. Review akaunting-migration/report.md (incl. "what's missing") and edit
#    akaunting-migration/mapping.json — set a "target" for any unmapped category.

# 3. Dry-run, then apply
npm run migrate:akaunting:apply -- --dry-run
npm run migrate:akaunting:apply

# Optional: also copy receipt files from Akaunting's storage folder
npm run migrate:akaunting:apply -- --attachments-dir /path/to/akaunting/storage
```

Each Akaunting *company* becomes a Quidly *property*. Amounts are treated as GBP;
non-GBP transactions are listed and skipped. The import is idempotent — re-running
is safe and never duplicates. Files under `akaunting-migration/` are git-ignored.
````

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all prior tests plus the new `suggest`, `transform`, `report`, `apply` suites green.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md
git commit -m "docs(migrate): README migration guide; ignore migration artefacts"
```

---

## Done

After Task 12, run `superpowers:finishing-a-development-branch` to merge/PR.

**Manual acceptance (with a real dump):** analyse → review report & mapping → `--dry-run` → apply → open Quidly and confirm the property, vendors, and transactions/SA105 figures look right; run apply again to confirm zero new rows.
