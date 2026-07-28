import { prisma } from "../../src/lib/db";
// Order is load-bearing, not cosmetic: delete children before the parents they
// reference. In particular Transaction -> LoanPayment -> Loan -> Property, and
// Loan -> Property is ON DELETE RESTRICT, so Property must be deleted last of the four.
export async function resetDb() {
  await prisma.loginAttempt.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.loanPayment.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.property.deleteMany();
  await prisma.companyLedgerEntry.deleteMany();
  await prisma.company.deleteMany();
  await prisma.taxYearProfile.deleteMany();
}
