import { taxYearRange } from "../tax/taxYear";
import type { Direction } from "../tax/types";

export interface TransactionFilter {
  taxYear?: string;
  categoryId?: string;
  direction?: Direction;
}
export interface TransactionWhere {
  propertyId?: string;
  categoryId?: string;
  direction?: Direction;
  date?: { gte: Date; lt: Date };
}
export function buildTransactionWhere(propertyId: string | null, filter: TransactionFilter): TransactionWhere {
  const where: TransactionWhere = {};
  if (propertyId) where.propertyId = propertyId;
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.direction) where.direction = filter.direction;
  if (filter.taxYear) {
    const { start, end } = taxYearRange(filter.taxYear);
    where.date = { gte: start, lt: end };
  }
  return where;
}
