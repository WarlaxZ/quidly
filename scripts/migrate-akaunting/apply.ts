import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { Mapping, SourceSnapshot, PropertyDecision } from "./types";
import { buildPlan, buildRecurringPlan, validateMapping } from "./transform";

export interface ApplyOptions {
  dryRun?: boolean;
  attachmentsDir?: string;
  uploadsDir?: string; // where Quidly stores attachment files; default "uploads"
}

export interface ApplyResult {
  propertiesCreated: number;
  vendorsCreated: number;
  transactionsCreated: number;
  recurringCreated: number;
  attachmentsCopied: number;
  skipped: number;
}

async function resolveProperty(
  prisma: PrismaClient,
  d: PropertyDecision,
): Promise<{ id: string; created: boolean }> {
  if ("existingPropertyId" in d.target) return { id: d.target.existingPropertyId, created: false };
  const existing = await prisma.property.findFirst({ where: { name: d.target.name } });
  if (existing) return { id: existing.id, created: false };
  const created = await prisma.property.create({
    data: { name: d.target.name, address: d.target.address ?? null },
  });
  return { id: created.id, created: true };
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
    recurringCreated: 0, attachmentsCopied: 0, skipped: plan.skipped.length,
  };

  if (opts.dryRun) {
    for (const p of mapping.properties) {
      if ("existingPropertyId" in p.target) continue;
      const existing = await prisma.property.findFirst({ where: { name: p.target.name } });
      if (!existing) result.propertiesCreated++;
    }
    result.vendorsCreated = plan.vendors.length;
    result.transactionsCreated = plan.transactions.length;
    result.recurringCreated = buildRecurringPlan(snapshot, mapping).recurring.length;
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
    const { id, created } = await resolveProperty(prisma, d);
    propertyIdByCompany.set(d.akauntingCompanyId, id);
    if (created) {
      result.propertiesCreated++;
      console.log(`Created property "${d.akauntingCompanyName}" (${id}).`);
    } else {
      console.log(`Using existing property (${id}) for Akaunting company "${d.akauntingCompanyName}".`);
    }
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

  // Recurring rules (idempotent by externalRef).
  const recurringPlan = buildRecurringPlan(snapshot, mapping);
  for (const r of recurringPlan.recurring) {
    const existing = await prisma.recurringRule.findUnique({ where: { externalRef: r.externalRef } });
    if (existing) continue;
    // ensure the category is resolved (recurring may use a category no transaction used)
    let categoryId = categoryIdByName.get(r.categoryName);
    if (!categoryId) {
      const cat = await prisma.category.findUnique({ where: { name: r.categoryName } });
      if (!cat) throw new Error(`Quidly category "${r.categoryName}" not found — run \`npm run db:seed\` first.`);
      categoryId = cat.id;
      categoryIdByName.set(r.categoryName, categoryId);
    }
    await prisma.recurringRule.create({
      data: {
        propertyId: propertyIdByCompany.get(r.akauntingCompanyId)!,
        categoryId,
        vendorId: r.vendorExternalRef ? vendorIdByRef.get(r.vendorExternalRef) ?? null : null,
        amountPence: r.amountPence,
        direction: r.direction,
        frequency: r.frequency,
        dayOfMonth: r.dayOfMonth,
        startDate: new Date(r.startDate),
        lastGeneratedDate: new Date(r.lastGeneratedDate),
        externalRef: r.externalRef,
      },
    });
    result.recurringCreated++;
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
      const alreadyImported = await prisma.attachment.findFirst({ where: { filePath: dest } });
      if (alreadyImported) continue; // idempotent: attachment already copied on a prior run
      copyFileSync(src, dest);
      const att = await prisma.attachment.create({ data: { filePath: dest, originalName: a.filename } });
      await prisma.transaction.update({ where: { id: txn.id }, data: { attachmentId: att.id } });
      result.attachmentsCopied++;
    }
  }

  return result;
}
