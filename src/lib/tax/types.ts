export type CategoryKind = "income" | "expense" | "finance" | "capital";
export type Direction = "in" | "out";
export type Region = "englandWalesNI" | "scotland";

/** A transaction as the tax engine sees it — money in pence, plus its category facts. */
export interface TaxTxn {
  date: Date;
  /** Always a POSITIVE integer number of pence. The category kind / direction conveys
   *  whether it is income or expenditure — amounts are never stored negative. */
  amountPence: number;
  direction: Direction;
  categoryKind: CategoryKind;
  allowable: boolean;
  sa105Box: string | null;
}
