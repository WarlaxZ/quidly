import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { startMariaWithDump } from "./mariadb";
import { readSnapshot } from "./read";
import { suggestCategory } from "./suggest";
import { buildReport } from "./report";
import type { Mapping, CategoryDecision, PropertyDecision, SourceSnapshot } from "./types";

const OUT_DIR = "akaunting-migration";

function buildInitialMapping(snapshot: SourceSnapshot): Mapping {
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
  if (existsSync(mappingPath) && !opts.force) {
    console.log(`Kept existing ${mappingPath} (use --force to regenerate).`);
  } else {
    writeFileSync(mappingPath, JSON.stringify(buildInitialMapping(snapshot), null, 2));
    console.log(`Wrote ${mappingPath}.`);
  }

  const currentMapping: Mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  writeFileSync(join(OUT_DIR, "report.md"), buildReport(snapshot, currentMapping));

  console.log(`Analyse complete. Review ${OUT_DIR}/report.md and ${mappingPath}, then run apply.`);
}
