export type UseOfHomeBasis = "weekly" | "monthly";

/** Annualise a use-of-home admin estimate. Integer pence in → integer pence out. */
export function useOfHomeAnnualPence(amountPence: number, basis: UseOfHomeBasis): number {
  const a = Math.max(0, Math.round(amountPence));
  return basis === "weekly" ? a * 52 : a * 12;
}
