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
}
export function updateProperty(id: string, input: Partial<PropertyInput>) {
  return prisma.property.update({ where: { id }, data: input });
}
