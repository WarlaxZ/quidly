import { taxYearRange } from "../tax/taxYear";
import type { Direction } from "../tax/types";

export interface TransactionFilter {
  taxYear?: string;
  categoryId?: string;
  direction?: Direction;
}
export interface TransactionWhere {
  propertyId: string;
  categoryId?: string;
  direction?: Direction;
  date?: { gte: Date; lt: Date };
}
export function buildTransactionWhere(propertyId: string, filter: TransactionFilter): TransactionWhere {
  const where: TransactionWhere = { propertyId };
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.direction) where.direction = filter.direction;
  if (filter.taxYear) {
    const { start, end } = taxYearRange(filter.taxYear);
    where.date = { gte: start, lt: end };
  }
  return where;
}
