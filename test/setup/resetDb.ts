import { prisma } from "../../src/lib/db";
export async function resetDb() {
  await prisma.loginAttempt.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.property.deleteMany();
  await prisma.company.deleteMany();
  await prisma.taxYearProfile.deleteMany();
}
