import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { analyse } from "./analyse";
import { applyPlan } from "./apply";
import type { Mapping, SourceSnapshot } from "./types";

const OUT_DIR = "akaunting-migration";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const command = process.argv[2];

  if (command === "analyse") {
    const dump = process.argv[3];
    if (!dump || dump.startsWith("--")) throw new Error("Usage: analyse <dump.sql> [--force]");
    await analyse(dump, { force: hasFlag("force") });
    return;
  }

  if (command === "apply") {
    const snapshotPath = join(OUT_DIR, "source.json");
    const mappingPath = join(OUT_DIR, "mapping.json");
    if (!existsSync(snapshotPath) || !existsSync(mappingPath)) {
      throw new Error(`Run analyse first — missing ${snapshotPath} or ${mappingPath}.`);
    }
    const snapshot: SourceSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const mapping: Mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
    const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
    const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl }) });
    try {
      const res = await applyPlan(prisma, snapshot, mapping, {
        dryRun: hasFlag("dry-run"),
        attachmentsDir: flag("attachments-dir"),
      });
      console.log(`${hasFlag("dry-run") ? "[dry-run] " : ""}Properties: ${res.propertiesCreated}, Vendors: ${res.vendorsCreated}, Transactions: ${res.transactionsCreated}, Attachments: ${res.attachmentsCopied}, Skipped: ${res.skipped}`);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  throw new Error(`Unknown command "${command ?? ""}". Use: analyse <dump.sql> | apply [--dry-run] [--attachments-dir <path>]`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
