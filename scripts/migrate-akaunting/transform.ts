import type {
  SourceSnapshot, Mapping,
  MigrationPlan, TransactionPayload, VendorPayload, SkippedTransaction, QuidlyCategoryName,
} from "./types";

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

  return errors;
}

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
