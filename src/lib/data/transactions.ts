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
}
export function listTransactions(propertyId: string) {
  return prisma.transaction.findMany({
    where: { propertyId }, orderBy: { date: "desc" },
    include: { category: true, vendor: true },
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
  return prisma.transaction.findUnique({ where: { id }, include: { category: true, vendor: true } });
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
export function listTransactionsFiltered(propertyId: string, filter: TransactionFilter) {
  return prisma.transaction.findMany({
    where: buildTransactionWhere(propertyId, filter),
    orderBy: { date: "desc" },
    include: { category: true, vendor: true },
  });
}

export async function bulkCreateTransactions(rows: TransactionInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await prisma.transaction.createMany({
    data: rows.map((r) => ({ ...r, source: "imported" as const })),
  });
  return result.count;
}
