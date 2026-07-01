import "server-only";
import { prisma } from "../db";

export interface CompanyInput {
  name: string;
  accountingYearEndDay: number;
  accountingYearEndMonth: number;
}

export function listCompanies() {
  return prisma.company.findMany({ orderBy: { createdAt: "asc" } });
}
export function getCompany(id: string) {
  return prisma.company.findUnique({ where: { id } });
}
export function createCompany(input: CompanyInput) {
  return prisma.company.create({ data: input });
}
export function updateCompany(id: string, input: Partial<CompanyInput>) {
  return prisma.company.update({ where: { id }, data: input });
}
export function getCompanyPropertyCount(id: string) {
  return prisma.property.count({ where: { companyId: id } });
}
export async function deleteCompanyIfEmpty(id: string): Promise<void> {
  if ((await getCompanyPropertyCount(id)) > 0) {
    throw new Error("Can't delete a company that still owns properties.");
  }
  const ledgerCount = await prisma.companyLedgerEntry.count({ where: { companyId: id } });
  if (ledgerCount > 0) {
    throw new Error("Can't delete a company that still has dividend or director's-loan entries.");
  }
  await prisma.company.delete({ where: { id } });
}
