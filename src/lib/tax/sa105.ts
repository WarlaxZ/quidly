import type { TaxTxn } from "./types";

/** Sum transaction amounts (pence) grouped by SA105 box. Transactions with no box are ignored. */
export function sa105Boxes(txns: TaxTxn[]): Record<string, number> {
  const boxes: Record<string, number> = {};
  for (const tx of txns) {
    if (!tx.sa105Box) continue;
    boxes[tx.sa105Box] = (boxes[tx.sa105Box] ?? 0) + tx.amountPence;
  }
  return boxes;
}
