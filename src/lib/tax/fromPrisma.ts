import type { CategoryKind, Direction, TaxTxn } from "./types";

/** The minimal shape of a Prisma transaction joined with its category. */
export interface TxnWithCategory {
  date: Date;
  amountPence: number;
  direction: Direction;
  category: { kind: CategoryKind; allowable: boolean; sa105Box: string | null };
}

export function toTaxTxn(row: TxnWithCategory): TaxTxn {
  return {
    date: row.date,
    amountPence: row.amountPence,
    direction: row.direction,
    categoryKind: row.category.kind,
    allowable: row.category.allowable,
    sa105Box: row.category.sa105Box,
  };
}
