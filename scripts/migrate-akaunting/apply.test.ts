import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import Database from "better-sqlite3";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { applyPlan } from "./apply";
import type { SourceSnapshot, Mapping } from "./types";

const TMP = join(process.cwd(), "akaunting-migration", "test-apply.db");
let prisma: PrismaClient;

beforeAll(async () => {
  rmSync(TMP, { force: true });
  // Build schema by executing every migration SQL in order.
  const raw = new Database(TMP);
  const migDir = join(process.cwd(), "prisma", "migrations");
  for (const dir of readdirSync(migDir).filter((d) => d.match(/^\d/)).sort()) {
    raw.exec(readFileSync(join(migDir, dir, "migration.sql"), "utf8"));
  }
  // Seed the categories this test's mapping targets.
  const cats: [string, string, string | null][] = [
    ["Rent received", "income", "20"],
    ["Property repairs and maintenance", "expense", "25"],
  ];
  for (const [name, kind, box] of cats) {
    raw.prepare("INSERT INTO Category (id, name, kind, sa105Box, allowable) VALUES (?,?,?,?,1)")
      .run(name, name, kind, box);
  }
  raw.close();
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${TMP}` }) });
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(TMP, { force: true });
});

function snapshot(): SourceSnapshot {
  return {
    akauntingVersion: "3.0",
    companies: [{ id: 1, name: "42 Example St" }],
    contacts: [{ id: 7, name: "Acme", type: "vendor", email: null, phone: null, address: null }],
    categories: [
      { id: 5, name: "Repairs", type: "expense" },
      { id: 6, name: "Rent", type: "income" },
    ],
    transactions: [
      { id: 100, companyId: 1, type: "expense", categoryId: 5, contactId: 7, paidAt: "2025-06-01T00:00:00.000Z", amount: "150.00", currencyCode: "GBP", description: "Leak" },
      { id: 101, companyId: 1, type: "income", categoryId: 6, contactId: null, paidAt: "2025-06-05T00:00:00.000Z", amount: "800.00", currencyCode: "GBP", description: "Rent" },
    ],
    attachments: [],
    otherTableCounts: {},
  };
}

function mapping(): Mapping {
  return {
    currency: { assume: "GBP" },
    properties: [{ akauntingCompanyId: 1, akauntingCompanyName: "42 Example St", target: { createNew: true, name: "42 Example St", address: null } }],
    categories: [
      { akauntingId: 5, akauntingName: "Repairs", akauntingType: "expense", count: 1, suggestion: "Property repairs and maintenance", target: "Property repairs and maintenance" },
      { akauntingId: 6, akauntingName: "Rent", akauntingType: "income", count: 1, suggestion: "Rent received", target: "Rent received" },
    ],
  };
}

describe("applyPlan", () => {
  it("dry-run writes nothing", async () => {
    const res = await applyPlan(prisma, snapshot(), mapping(), { dryRun: true });
    expect(res.transactionsCreated).toBe(2);
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("creates property, vendor and transactions", async () => {
    const res = await applyPlan(prisma, snapshot(), mapping(), {});
    expect(res.transactionsCreated).toBe(2);
    expect(await prisma.property.count()).toBe(1);
    expect(await prisma.vendor.count()).toBe(1);
    const rent = await prisma.transaction.findUnique({ where: { externalRef: "akaunting:transaction:101" } });
    expect(rent?.amountPence).toBe(80000);
    expect(rent?.direction).toBe("in");
  });

  it("is idempotent — a second apply creates nothing new", async () => {
    const res = await applyPlan(prisma, snapshot(), mapping(), {});
    expect(res.transactionsCreated).toBe(0);
    expect(await prisma.transaction.count()).toBe(2);
    expect(await prisma.property.count()).toBe(1);
  });

  it("creates recurring rules idempotently", async () => {
    const snap = snapshot();
    snap.recurring = [
      { id: 16, templateTxnId: 101, frequency: "monthly", interval: 1, startedAt: "2025-12-18T00:00:00.000Z", status: "active", type: "income", amount: "750.00", currencyCode: "GBP", categoryId: 6, contactId: 7, description: "Rent" },
    ];
    const res1 = await applyPlan(prisma, snap, mapping(), {});
    expect(res1.recurringCreated).toBe(1);
    const rule = await prisma.recurringRule.findUnique({ where: { externalRef: "akaunting:recurring:16" } });
    expect(rule?.amountPence).toBe(75000);
    expect(rule?.intervalUnit).toBe("MONTH");
    expect(rule?.intervalCount).toBe(1);
    expect(rule?.dayOfMonth).toBe(18); // 2025-12-18
    expect(rule?.direction).toBe("in");
    // idempotent
    const res2 = await applyPlan(prisma, snap, mapping(), {});
    expect(res2.recurringCreated).toBe(0);
    expect(await prisma.recurringRule.count()).toBe(1);
  });
});
