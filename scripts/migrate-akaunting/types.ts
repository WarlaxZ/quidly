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

export interface SourceRecurring {
  id: number;                  // akk_recurring.id
  templateTxnId: number;       // recurable_id
  frequency: string;           // "monthly" | "yearly" | ...
  interval: number;
  startedAt: string;           // ISO
  status: string;
  type: "income" | "expense";  // normalised from the template transaction
  amount: string;              // decimal string
  currencyCode: string;
  categoryId: number | null;
  contactId: number | null;
  description: string | null;
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
  recurring?: SourceRecurring[];
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

export interface RecurringRulePayload {
  externalRef: string;         // "akaunting:recurring:<id>"
  akauntingCompanyId: number;  // resolved to propertyId at apply time
  amountPence: number;
  direction: "in" | "out";
  categoryName: QuidlyCategoryName;
  vendorExternalRef: string | null;
  description: string | null;
  intervalUnit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;           // ISO
  lastGeneratedDate: string;   // ISO -- newest imported txn date (no backfill)
}

export interface SkippedRecurring {
  id: number;
  reason: string;
}

export interface RecurringPlan {
  recurring: RecurringRulePayload[];
  skipped: SkippedRecurring[];
}
