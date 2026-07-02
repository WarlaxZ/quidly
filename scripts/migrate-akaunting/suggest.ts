import { QUIDLY_CATEGORY_NAMES, type QuidlyCategoryName } from "./types";

/**
 * Heuristic mapping from an Akaunting category (name + income/expense type) to a
 * Quidly category. Returns null when not confident — a null must be resolved by
 * the user, because a wrong SA105 box means a wrong tax return.
 *
 * Matching is whole-word (with naive plural stripping) rather than substring, so
 * "fixtures" does not match "fix", "coffee" does not match "fee", etc. Multi-word
 * signals are matched as phrases. The mortgage/interest bucket deliberately excludes
 * capital repayments and interest-free purchases, which do not belong in SA105 box 44.
 */
export function suggestCategory(
  name: string,
  type: "income" | "expense",
): QuidlyCategoryName | null {
  const lower = name.toLowerCase();
  // Strongest signal: the category name IS a Quidly category name, optionally behind a
  // "Label: " prefix (e.g. "TAX: Other allowable property expenses"). Common when the user
  // named their Akaunting categories after the SA105 boxes. Checked before keyword heuristics.
  // Only these two Quidly categories are income; the rest are expense/finance/capital.
  const INCOME_NAMES = new Set(["rent received", "other property income"]);
  const trimmed = lower.trim();
  for (const candidate of [trimmed, trimmed.replace(/^[^:]*:\s*/, "").trim()]) {
    const exact = QUIDLY_CATEGORY_NAMES.find((q) => q.toLowerCase() === candidate);
    if (exact && (type === "income") === INCOME_NAMES.has(exact.toLowerCase())) return exact;
  }
  const stem = (w: string) => (w.endsWith("s") ? w.slice(0, -1) : w);
  const words = new Set((lower.match(/[a-z]+/g) ?? []).map(stem));
  const word = (...ws: string[]) => ws.some((w) => words.has(stem(w)));
  const phrase = (...ps: string[]) => ps.some((p) => lower.includes(p));

  if (type === "income") {
    if (phrase("rent received", "rental income") || word("rent")) return "Rent received";
    return "Other property income"; // all other income → box 21
  }

  // Finance interest — but NOT capital repayments or interest-free purchases (not box 44).
  if (
    (word("mortgage") || word("interest")) &&
    !word("repayment") &&
    !phrase("interest free", "interest-free")
  ) {
    return "Mortgage / loan interest";
  }
  if (word("capital", "improvement", "renovation")) return "Capital improvements";
  if (word("repair", "maintenance", "boiler")) return "Property repairs and maintenance";
  if (word("insurance", "rate") || phrase("ground rent", "service charge")) {
    return "Rent, rates, insurance, ground rents";
  }
  if (
    word("legal", "management", "accountant", "professional", "fee") ||
    phrase("letting agent", "managing agent", "estate agent")
  ) {
    return "Legal, management, other professional fees";
  }
  if (word("wage", "cleaning", "gardening")) {
    return "Costs of services provided, including wages";
  }
  return null;
}
