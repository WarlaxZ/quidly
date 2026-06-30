import "server-only";
import { prisma } from "../db";

export function createAttachment(data: { filePath: string; originalName: string; extractedData: string | null }) {
  return prisma.attachment.create({ data });
}

export function getAttachment(id: string) {
  return prisma.attachment.findUnique({ where: { id } });
}
