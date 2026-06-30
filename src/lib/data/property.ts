import "server-only";
import { prisma } from "../db";

export async function getOrCreateDefaultProperty() {
  const existing = await prisma.property.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.property.create({ data: { name: "My Property" } });
}
export interface PropertyInput {
  name: string;
  address?: string | null;
  ownershipType?: "personal" | "company";
}

export function updateProperty(id: string, input: Partial<PropertyInput>) {
  return prisma.property.update({ where: { id }, data: input });
}

export function createProperty(input: PropertyInput) {
  return prisma.property.create({ data: { name: input.name, address: input.address ?? null, ownershipType: input.ownershipType ?? "personal" } });
}

export function getProperty(id: string) {
  return prisma.property.findUnique({ where: { id } });
}

export async function getPropertyCounts(id: string): Promise<{ transactions: number; recurring: number }> {
  const [transactions, recurring] = await Promise.all([
    prisma.transaction.count({ where: { propertyId: id } }),
    prisma.recurringRule.count({ where: { propertyId: id } }),
  ]);
  return { transactions, recurring };
}

export async function deletePropertyIfEmpty(id: string): Promise<void> {
  const counts = await getPropertyCounts(id);
  if (counts.transactions > 0 || counts.recurring > 0) {
    throw new Error("Can't delete a property that still has transactions or recurring rules.");
  }
  await prisma.property.delete({ where: { id } });
}
