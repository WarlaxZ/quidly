import type {
  SourceSnapshot, Mapping,
  MigrationPlan, TransactionPayload, VendorPayload, SkippedTransaction, QuidlyCategoryName,
  SourceRecurring, RecurringRulePayload, SkippedRecurring, RecurringPlan,
} from "./types";

/** The two income Quidly categories; everything else is expense/finance/capital. */
const QUIDLY_INCOME_NAMES = new Set(["Rent received", "Other property income"]);

const RECURRING_ACTIVE_MONTHS = 18; // a recurrence whose latest start is older than this (relative to the newest transaction) is treated as discontinued

/**
 * Convert an Akaunting decimal amount string (up to 4dp) to integer pence,
 * without ever going through a float. Rounds half-up at the pence boundary
 * using the THIRD decimal digit only — the 4th digit is intentionally ignored
 * (Akaunting stores DECIMAL(15,4) but money is 2dp; the 3rd digit is the tie-breaker).
 * Throws on empty input so a missing amount fails loudly rather than silently becoming 0.
 */
export function decimalStringToPence(amount: string): number {
  const trimmed = amount.trim();
  if (trimmed === "") throw new Error("decimalStringToPence: empty amount");
  const neg = trimmed.startsWith("-");
  const clean = trimmed.replace(/^[-+]/, "");
  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const thirdDigit = frac.charAt(2);
  let pence = Number(whole || "0") * 100 + Number(fracPadded);
  if (thirdDigit !== "" && Number(thirdDigit) >= 5) pence += 1;
  return neg ? -pence : pence;
}

function isGbp(currencyCode: string, assume: string): boolean {
  return currencyCode.toUpperCase() === assume.toUpperCase();
}

/** Returns human-readable errors; empty array means the mapping is ready to apply. */
export function validateMapping(snapshot: SourceSnapshot, mapping: Mapping): string[] {
  const errors: string[] = [];
  const assume = mapping.currency.assume;

  // (a) every company used by a GBP transaction needs a property decision.
  // (Mirrors the apply path: buildPlan only imports GBP transactions, so a company
  //  that appears solely on skipped non-GBP transactions does not require a mapping.)
  const mappedCompanyIds = new Set(mapping.properties.map((p) => p.akauntingCompanyId));
  const usedCompanyIds = new Set(
    snapshot.transactions.filter((t) => isGbp(t.currencyCode, assume)).map((t) => t.companyId),
  );
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

  // (c) a category used by GBP transactions must map to a target of the matching kind:
  // an Akaunting "income" category must map to an income Quidly category, and vice versa.
  for (const categoryId of gbpCategoryIds) {
    const decision = decisionById.get(categoryId);
    if (!decision || decision.target == null) continue; // already reported by rule (b)
    const targetIsIncome = QUIDLY_INCOME_NAMES.has(decision.target);
    const sourceIsIncome = decision.akauntingType === "income";
    if (sourceIsIncome !== targetIsIncome) {
      errors.push(
        `Category "${decision.akauntingName}" is an Akaunting ${decision.akauntingType} category but is mapped to ${targetIsIncome ? "an income" : "a non-income"} Quidly category "${decision.target}" — fix the target in mapping.json.`,
      );
    }
  }

  return errors;
}

function contactDetails(c: { email: string | null; phone: string | null; address: string | null }): string | null {
  const parts = [c.email, c.phone, c.address].filter((p): p is string => !!p && p.trim() !== "");
  return parts.length ? parts.join(" | ") : null;
}

/**
 * Build the migration plan from a snapshot + mapping.
 *
 * Precondition: validateMapping(snapshot, mapping) returned no errors. buildPlan
 * is defensive regardless — it silently skips transactions it cannot place:
 *  - non-GBP transactions (reason "non-GBP currency <code>"),
 *  - transactions whose category has no target, or no category at all
 *    (reason "no category target ..." / "transaction has no category").
 * A transaction whose contactId does not resolve to a contact in the snapshot
 * (e.g. the contact was soft-deleted in Akaunting) is still imported, but with
 * no vendor link, so the plan never references a vendor it won't create.
 */
export function buildPlan(snapshot: SourceSnapshot, mapping: Mapping): MigrationPlan {
  const assume = mapping.currency.assume;
  const targetByCategoryId = new Map<number, QuidlyCategoryName | null>(
    mapping.categories.map((c) => [c.akauntingId, c.target]),
  );
  const contactIds = new Set(snapshot.contacts.map((c) => c.id));

  const transactions: TransactionPayload[] = [];
  const skipped: SkippedTransaction[] = [];
  const usedContactIds = new Set<number>();

  for (const t of snapshot.transactions) {
    if (!isGbp(t.currencyCode, assume)) {
      skipped.push({ id: t.id, reason: `non-GBP currency ${t.currencyCode}` });
      continue;
    }
    if (t.categoryId == null) {
      skipped.push({ id: t.id, reason: "transaction has no category" });
      continue;
    }
    const target = targetByCategoryId.get(t.categoryId);
    if (!target) {
      skipped.push({ id: t.id, reason: `no category target for category id ${t.categoryId}` });
      continue;
    }
    // Only link a vendor we will actually create (contact present in the snapshot).
    const hasContact = t.contactId != null && contactIds.has(t.contactId);
    if (hasContact) usedContactIds.add(t.contactId as number);
    transactions.push({
      externalRef: `akaunting:transaction:${t.id}`,
      akauntingCompanyId: t.companyId,
      date: t.paidAt,
      amountPence: decimalStringToPence(t.amount),
      direction: t.type === "income" ? "in" : "out",
      categoryName: target,
      vendorExternalRef: hasContact ? `akaunting:contact:${t.contactId}` : null,
      description: t.description,
    });
  }

  const vendors: VendorPayload[] = snapshot.contacts
    .filter((c) => usedContactIds.has(c.id))
    .sort((a, b) => a.id - b.id)
    .map((c) => ({
      externalRef: `akaunting:contact:${c.id}`,
      name: c.name,
      contactDetails: contactDetails(c),
    }));

  return { vendors, transactions, skipped };
}

function mapFrequency(freq: string, interval: number): RecurringRulePayload["frequency"] | null {
  const f = freq.toLowerCase();
  if (f === "yearly" || f === "annual" || (f === "monthly" && interval === 12)) return "annual";
  if (f === "monthly" && interval === 3) return "quarterly";
  if (f === "monthly" && interval === 1) return "monthly";
  return null; // daily/weekly/other intervals: no Quidly equivalent
}

/**
 * Build Quidly recurring rules from Akaunting recurring definitions.
 *
 * Akaunting churns recurring records: on each cycle it soft-deletes the record and its
 * template transaction and recreates them, so `deleted_at` is set on essentially ALL rows
 * and `status` stays "active" throughout — neither is a reliable "is this still running?"
 * signal. We therefore dedupe by (type, category, contact) and treat a recurrence as active
 * only if its latest start is within RECURRING_ACTIVE_MONTHS of the newest transaction.
 * Recurring import is best-effort — the user should review the /recurring page before generating.
 *
 * Validity (currency, frequency, category) is checked BEFORE dedupe so a newer-but-invalid
 * record cannot mask an older-but-valid one for the same key. lastGeneratedDate is set to the
 * newest imported transaction date so generation never backfills already-imported history.
 */
export function buildRecurringPlan(snapshot: SourceSnapshot, mapping: Mapping): RecurringPlan {
  const recurring: RecurringRulePayload[] = [];
  const skipped: SkippedRecurring[] = [];
  const src = snapshot.recurring ?? [];
  if (src.length === 0) return { recurring, skipped };

  const assume = mapping.currency.assume;
  const targetByCategoryId = new Map<number, QuidlyCategoryName | null>(
    mapping.categories.map((c) => [c.akauntingId, c.target]),
  );
  const contactIds = new Set(snapshot.contacts.map((c) => c.id));

  // "as of" reference = newest imported transaction date (deterministic; drives recency + lastGeneratedDate)
  const txnDates = snapshot.transactions.map((t) => new Date(t.paidAt).getTime());
  const asOfMs = txnDates.length
    ? Math.max(...txnDates)
    : Math.max(...src.map((r) => new Date(r.startedAt).getTime()));
  const asOf = new Date(asOfMs);
  const cutoff = new Date(asOf);
  cutoff.setMonth(cutoff.getMonth() - RECURRING_ACTIVE_MONTHS);

  const keyOf = (r: SourceRecurring) => `${r.type}|${r.categoryId ?? "?"}|${r.contactId ?? "?"}`;

  // 1) keep only importable records; remember a skip reason per key that has no importable record
  interface Candidate { r: SourceRecurring; freq: RecurringRulePayload["frequency"]; target: QuidlyCategoryName }
  const importable: Candidate[] = [];
  const importableKeys = new Set<string>();
  const invalidByKey = new Map<string, SkippedRecurring>();
  for (const r of src) {
    const key = keyOf(r);
    if (r.currencyCode.toUpperCase() !== assume.toUpperCase()) {
      if (!invalidByKey.has(key)) invalidByKey.set(key, { id: r.id, reason: `non-GBP currency ${r.currencyCode}` });
      continue;
    }
    const freq = mapFrequency(r.frequency, r.interval);
    if (!freq) {
      if (!invalidByKey.has(key)) invalidByKey.set(key, { id: r.id, reason: `unsupported frequency ${r.frequency}/interval ${r.interval}` });
      continue;
    }
    const target = r.categoryId != null ? targetByCategoryId.get(r.categoryId) : null;
    if (!target) {
      if (!invalidByKey.has(key)) invalidByKey.set(key, { id: r.id, reason: `no category target for category id ${r.categoryId}` });
      continue;
    }
    importable.push({ r, freq, target });
    importableKeys.add(key);
  }

  // 2) dedupe importable to the latest startedAt per key
  const latest = new Map<string, Candidate>();
  for (const c of importable) {
    const key = keyOf(c.r);
    const prev = latest.get(key);
    if (!prev || new Date(c.r.startedAt) > new Date(prev.r.startedAt)) latest.set(key, c);
  }

  // 3) recency filter + build payloads
  for (const c of latest.values()) {
    const { r, freq, target } = c;
    if (new Date(r.startedAt) < cutoff) {
      skipped.push({ id: r.id, reason: `discontinued (last started ${r.startedAt.slice(0, 10)}, older than ${RECURRING_ACTIVE_MONTHS} months)` });
      continue;
    }
    const hasContact = r.contactId != null && contactIds.has(r.contactId);
    const day = new Date(r.startedAt).getUTCDate();
    recurring.push({
      externalRef: `akaunting:recurring:${r.id}`,
      akauntingCompanyId: snapshot.companies[0]?.id ?? 1,
      amountPence: decimalStringToPence(r.amount),
      direction: r.type === "income" ? "in" : "out",
      categoryName: target,
      vendorExternalRef: hasContact ? `akaunting:contact:${r.contactId}` : null,
      frequency: freq,
      dayOfMonth: Math.min(Math.max(day, 1), 31), // Quidly's dateOn() clamps to each month's real last day
      startDate: r.startedAt,
      lastGeneratedDate: asOf.toISOString(),
    });
  }

  // 4) report keys that had no importable record at all
  for (const [key, sk] of invalidByKey) {
    if (!importableKeys.has(key)) skipped.push(sk);
  }

  return { recurring, skipped };
}
