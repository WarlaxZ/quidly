export type CategoryKind = "income" | "expense" | "finance" | "capital";
export type Direction = "in" | "out";
export type Region = "englandWalesNI" | "scotland";

/** A transaction as the tax engine sees it — money in pence, plus its category facts. */
export interface TaxTxn {
  date: Date;
  amountPence: number;
  direction: Direction;
  categoryKind: CategoryKind;
  allowable: boolean;
  sa105Box: string | null;
}
