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
