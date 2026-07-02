// Analyse phase: load the Akaunting dump, freeze a snapshot, and produce the editable
// mapping.json + human report.md the user reviews before running apply.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startMariaWithDump } from "./mariadb";
import { readSnapshot } from "./read";
import { suggestCategory } from "./suggest";
import { buildReport } from "./report";
import type { Mapping, CategoryDecision, PropertyDecision, SourceSnapshot } from "./types";

const OUT_DIR = "akaunting-migration";

export function buildInitialMapping(snapshot: SourceSnapshot): Mapping {
  const counts = new Map<number, number>();
  for (const t of snapshot.transactions) {
    if (t.categoryId != null) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  }
  const categories: CategoryDecision[] = snapshot.categories
    .filter((c) => c.type === "income" || c.type === "expense")
    .map((c) => {
      const suggestion = suggestCategory(c.name, c.type as "income" | "expense");
      return {
        akauntingId: c.id, akauntingName: c.name, akauntingType: c.type,
        count: counts.get(c.id) ?? 0, suggestion, target: suggestion,
      };
    });
  const properties: PropertyDecision[] = snapshot.companies.map((c) => ({
    akauntingCompanyId: c.id, akauntingCompanyName: c.name,
    target: { createNew: true, name: c.name, address: null },
  }));
  return { currency: { assume: "GBP" }, properties, categories };
}

export async function analyse(dumpPath: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!existsSync(dumpPath)) throw new Error(`Dump not found: ${dumpPath}`);
  mkdirSync(OUT_DIR, { recursive: true });

  const { mysqlConfig, stop } = await startMariaWithDump(dumpPath);
  let snapshot: SourceSnapshot;
  try {
    snapshot = await readSnapshot(mysqlConfig);
  } finally {
    stop();
  }

  writeFileSync(join(OUT_DIR, "source.json"), JSON.stringify(snapshot, null, 2));

  const mappingPath = join(OUT_DIR, "mapping.json");
  let currentMapping: Mapping;
  if (existsSync(mappingPath) && !opts.force) {
    currentMapping = JSON.parse(readFileSync(mappingPath, "utf8")) as Mapping;
    console.log(`Kept existing ${mappingPath} (use --force to regenerate).`);
    const newIds = snapshot.categories
      .filter((c) => c.type === "income" || c.type === "expense")
      .map((c) => c.id)
      .filter((id) => !currentMapping.categories.some((cd) => cd.akauntingId === id));
    if (newIds.length > 0) {
      console.warn(`WARNING: ${newIds.length} category id(s) in the dump are not in mapping.json — re-run with --force to include them.`);
    }
  } else {
    currentMapping = buildInitialMapping(snapshot);
    writeFileSync(mappingPath, JSON.stringify(currentMapping, null, 2));
    console.log(`Wrote ${mappingPath}.`);
  }

  writeFileSync(join(OUT_DIR, "report.md"), buildReport(snapshot, currentMapping));

  console.log(`Analyse complete. Review ${OUT_DIR}/report.md and ${mappingPath}, then run apply.`);
}
