import "server-only";
import { prisma } from "../db";

export function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}
