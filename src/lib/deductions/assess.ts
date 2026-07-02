import type { DeductionItem, DeductionTxn } from "./catalog";

export type DeductionState = "covered" | "consider" | "dismissed";
export interface DeductionStatus {
  item: DeductionItem;
  state: DeductionState;
}

function txnMatches(item: DeductionItem, txn: DeductionTxn): boolean {
  if (item.match.categoryNames?.includes(txn.categoryName)) return true;
  const desc = (txn.description ?? "").toLowerCase();
  if (desc && item.match.descriptionKeywords?.some((k) => desc.includes(k))) return true;
  return false;
}

/**
 * Classify each catalog item for a tax year:
 *  - "dismissed" if the user marked it not-applicable,
 *  - else "covered" if any of the year's transactions matches its rule,
 *  - else "consider".
 */
export function assessDeductions(
  items: DeductionItem[],
  txns: DeductionTxn[],
  dismissedKeys: Set<string>,
): DeductionStatus[] {
  return items.map((item) => {
    if (dismissedKeys.has(item.key)) return { item, state: "dismissed" as const };
    const covered = txns.some((t) => txnMatches(item, t));
    return { item, state: covered ? ("covered" as const) : ("consider" as const) };
  });
}
