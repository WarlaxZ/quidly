import "server-only";
import { prisma } from "../db";
import { taxYearRange } from "../tax/taxYear";
import type { Direction } from "../tax/types";
import { buildTransactionWhere, type TransactionFilter } from "./transactionFilter";

export interface TransactionInput {
  propertyId: string;
  categoryId: string;
  date: Date;
  amountPence: number;
  direction: Direction;
  vendorId?: string | null;
  description?: string | null;
  miles?: number | null;
  attachmentId?: string | null;
  source?: "manual" | "recurring" | "imported";
}
export function listTransactions(propertyId: string | null) {
  return prisma.transaction.findMany({
    where: propertyId ? { propertyId } : {},
    orderBy: { date: "desc" },
    include: { category: true, vendor: true, property: true },
  });
}
export function listTransactionsForTaxYear(propertyId: string, taxYear: string) {
  const { start, end } = taxYearRange(taxYear);
  return prisma.transaction.findMany({
    where: { propertyId, date: { gte: start, lt: end } },
    orderBy: { date: "asc" }, include: { category: true },
  });
}
export function getTransaction(id: string) {
  return prisma.transaction.findUnique({
    where: { id },
    include: { category: true, vendor: true, attachment: true, loanPayment: { include: { loan: true } } },
  });
}
export function createTransaction(input: TransactionInput) {
  return prisma.transaction.create({ data: input });
}
export function updateTransaction(id: string, input: Partial<TransactionInput>) {
  return prisma.transaction.update({ where: { id }, data: input });
}
export function deleteTransaction(id: string) {
  return prisma.transaction.delete({ where: { id } });
}

/**
 * A transaction generated from a loan payment carries the split between deductible
 * interest and non-deductible capital. Deleting it directly (rather than through the
 * loan) would desync the ledger from that audit trail. Returns a user-facing message
 * naming the loan when deletion should be refused, or null when it's safe to proceed.
 */
export function loanDeleteBlockMessage(
  transaction: { loanPaymentId: string | null; loanPayment?: { loan: { name: string } } | null },
): string | null {
  if (!transaction.loanPaymentId) return null;
  const loanName = transaction.loanPayment?.loan.name ?? "its loan";
  return `That row is part of a payment on ${loanName}. Remove it from the loan instead.`;
}
export function listTransactionsFiltered(propertyId: string | null, filter: TransactionFilter) {
  return prisma.transaction.findMany({
    where: buildTransactionWhere(propertyId, filter),
    orderBy: { date: "desc" },
    include: { category: true, vendor: true, property: true },
  });
}

export async function bulkCreateTransactions(rows: TransactionInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await prisma.transaction.createMany({
    data: rows.map((r) => ({ ...r, source: "imported" as const })),
  });
  return result.count;
}
