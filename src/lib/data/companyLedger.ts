import "server-only";
import { prisma } from "../db";
import type { CompanyLedgerKind } from "@prisma/client";

export interface LedgerEntryInput {
  companyId: string;
  date: Date;
  kind: CompanyLedgerKind;
  amountPence: number;
  note?: string | null;
}

export function listLedgerEntries(companyId: string) {
  return prisma.companyLedgerEntry.findMany({
    where: { companyId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export function createLedgerEntry(input: LedgerEntryInput) {
  return prisma.companyLedgerEntry.create({
    data: {
      companyId: input.companyId,
      date: input.date,
      kind: input.kind,
      amountPence: input.amountPence,
      note: input.note ?? null,
    },
  });
}

export async function deleteLedgerEntry(id: string, companyId: string) {
  // Scoped by companyId so an entry id alone can't delete another company's record.
  await prisma.companyLedgerEntry.deleteMany({ where: { id, companyId } });
}
