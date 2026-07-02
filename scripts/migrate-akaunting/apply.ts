import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { Mapping, SourceSnapshot, PropertyDecision } from "./types";
import { buildPlan, validateMapping } from "./transform";

export interface ApplyOptions {
  dryRun?: boolean;
  attachmentsDir?: string;
  uploadsDir?: string; // where Quidly stores attachment files; default "uploads"
}

export interface ApplyResult {
  propertiesCreated: number;
  vendorsCreated: number;
  transactionsCreated: number;
  attachmentsCopied: number;
  skipped: number;
}

async function resolveProperty(prisma: PrismaClient, d: PropertyDecision): Promise<string> {
  if ("existingPropertyId" in d.target) return d.target.existingPropertyId;
  const existing = await prisma.property.findFirst({ where: { name: d.target.name } });
  if (existing) return existing.id;
  const created = await prisma.property.create({
    data: { name: d.target.name, address: d.target.address ?? null },
  });
  return created.id;
}

export async function applyPlan(
  prisma: PrismaClient,
  snapshot: SourceSnapshot,
  mapping: Mapping,
  opts: ApplyOptions,
): Promise<ApplyResult> {
  const errors = validateMapping(snapshot, mapping);
  if (errors.length) {
    throw new Error("Mapping is not ready to apply:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }
  const plan = buildPlan(snapshot, mapping);
  const result: ApplyResult = {
    propertiesCreated: 0, vendorsCreated: 0, transactionsCreated: 0,
    attachmentsCopied: 0, skipped: plan.skipped.length,
  };

  if (opts.dryRun) {
    result.propertiesCreated = mapping.properties.filter((p) => "createNew" in p.target).length;
    result.vendorsCreated = plan.vendors.length;
    result.transactionsCreated = plan.transactions.length;
    return result;
  }

  // NOTE: We run the writes sequentially against `prisma` rather than inside an
  // interactive `prisma.$transaction(async (tx) => {...})`. The
  // @prisma/adapter-better-sqlite3 driver adapter does not reliably support
  // interactive transactions. Idempotency via `externalRef` already makes
  // partial-failure re-runs safe, so losing atomicity is acceptable for this
  // one-shot migration tool.
  const propertyIdByCompany = new Map<number, string>();
  for (const d of mapping.properties) {
    const before = await prisma.property.count();
    const id = await resolveProperty(prisma, d);
    if ((await prisma.property.count()) > before) result.propertiesCreated++;
    propertyIdByCompany.set(d.akauntingCompanyId, id);
  }

  const vendorIdByRef = new Map<string, string>();
  for (const v of plan.vendors) {
    const existing = await prisma.vendor.findUnique({ where: { externalRef: v.externalRef } });
    if (existing) { vendorIdByRef.set(v.externalRef, existing.id); continue; }
    const created = await prisma.vendor.create({
      data: { name: v.name, contactDetails: v.contactDetails, externalRef: v.externalRef },
    });
    vendorIdByRef.set(v.externalRef, created.id);
    result.vendorsCreated++;
  }

  const categoryIdByName = new Map<string, string>();
  for (const name of new Set(plan.transactions.map((t) => t.categoryName))) {
    const cat = await prisma.category.findUnique({ where: { name } });
    if (!cat) throw new Error(`Quidly category "${name}" not found — run \`npm run db:seed\` first.`);
    categoryIdByName.set(name, cat.id);
  }

  for (const t of plan.transactions) {
    const exists = await prisma.transaction.findUnique({ where: { externalRef: t.externalRef } });
    if (exists) continue;
    await prisma.transaction.create({
      data: {
        propertyId: propertyIdByCompany.get(t.akauntingCompanyId)!,
        date: new Date(t.date),
        amountPence: t.amountPence,
        direction: t.direction,
        categoryId: categoryIdByName.get(t.categoryName)!,
        vendorId: t.vendorExternalRef ? vendorIdByRef.get(t.vendorExternalRef) ?? null : null,
        description: t.description,
        source: "imported",
        externalRef: t.externalRef,
      },
    });
    result.transactionsCreated++;
  }

  if (opts.attachmentsDir) {
    const uploads = opts.uploadsDir ?? "uploads";
    mkdirSync(uploads, { recursive: true });
    for (const a of snapshot.attachments) {
      const src = join(opts.attachmentsDir, a.directory ?? "", a.filename);
      if (!existsSync(src)) continue;
      const txn = await prisma.transaction.findUnique({ where: { externalRef: `akaunting:transaction:${a.transactionId}` } });
      if (!txn) continue;
      const dest = join(uploads, `${a.transactionId}-${basename(a.filename)}`);
      copyFileSync(src, dest);
      const att = await prisma.attachment.create({ data: { filePath: dest, originalName: a.filename } });
      await prisma.transaction.update({ where: { id: txn.id }, data: { attachmentId: att.id } });
      result.attachmentsCopied++;
    }
  }

  return result;
}
