import "server-only";
import { prisma } from "../db";

export interface VendorInput {
  name: string;
  contactDetails?: string | null;
  notes?: string | null;
  defaultCategoryId?: string | null;
}
export function getVendor(id: string) {
  return prisma.vendor.findUnique({ where: { id } });
}
export function listVendors() {
  return prisma.vendor.findMany({ orderBy: { name: "asc" } });
}
export function createVendor(input: VendorInput) {
  return prisma.vendor.create({ data: input });
}
export function updateVendor(id: string, input: Partial<VendorInput>) {
  return prisma.vendor.update({ where: { id }, data: input });
}
export function deleteVendor(id: string) {
  return prisma.vendor.delete({ where: { id } });
}
