import type { SourceSnapshot, Mapping } from "./types";
import { buildPlan, buildRecurringPlan, validateMapping } from "./transform";
import { describeSchedule } from "../../src/lib/recurring/describe";

const escapeCell = (s: string): string => s.replace(/\|/g, "\\|");

/** Known Akaunting feature tables Quidly has no home for, with an explanation. */
const GAP_EXPLANATIONS: Record<string, string> = {
  documents: "Invoices/bills (Akaunting 3.x) — Quidly tracks money movements, not open receivables/payables.",
  invoices: "Invoices (Akaunting 2.x) — Quidly tracks received money, not open receivables.",
  bills: "Bills (Akaunting 2.x) — Quidly tracks paid money, not open payables.",
  items: "Product/service catalogue — no equivalent in Quidly.",
  accounts: "Bank accounts / reconciliation — Quidly has no multi-account or bank-rec model.",
  transfers: "Inter-account transfers — no multi-account model in Quidly.",
  taxes: "Tax/VAT rates — Quidly computes UK property tax from categories, not stored rates.",
  recurring: "Recurring templates — Quidly has its own recurring rules; Akaunting's are not imported.",
  reconciliations: "Bank reconciliations — no equivalent in Quidly.",
};

export function buildReport(snapshot: SourceSnapshot, mapping: Mapping): string {
  const errors = validateMapping(snapshot, mapping);
  const plan = buildPlan(snapshot, mapping);

  const lines: string[] = [];
  lines.push("# Akaunting → Quidly migration report", "");
  lines.push(`Akaunting version: ${snapshot.akauntingVersion ?? "unknown"}`, "");

  lines.push("## Summary", "");
  lines.push(`- Companies (→ properties): ${snapshot.companies.length}`);
  lines.push(`- Transactions: ${snapshot.transactions.length} (will import ${plan.transactions.length}, skip ${plan.skipped.length})`);
  lines.push(`- Vendors/contacts: ${snapshot.contacts.length} (will create ${plan.vendors.length} used by imported transactions)`);
  lines.push(`- Categories: ${snapshot.categories.length}`);
  lines.push("");

  lines.push("## Category mapping", "");
  lines.push("| Akaunting category | Type | Txns | → Quidly category |");
  lines.push("|---|---|---|---|");
  for (const c of mapping.categories) {
    const target = c.target ?? "**NEEDS MAPPING (unmapped)**";
    lines.push(`| ${escapeCell(c.akauntingName)} | ${escapeCell(c.akauntingType)} | ${c.count} | ${escapeCell(target)} |`);
  }
  lines.push("");

  if (errors.length) {
    lines.push("## ⚠ Blocking issues (fix mapping.json before apply)", "");
    for (const e of errors) lines.push(`- ${e}`);
    lines.push("");
  }

  // Skips the user cannot fix by editing mapping.json: non-GBP and no-category.
  // "no category target" skips are transient (they import once the category is mapped)
  // and are already surfaced under Blocking issues, so they are excluded here.
  const permanentSkips = plan.skipped.filter((s) => !s.reason.startsWith("no category target"));
  if (permanentSkips.length) {
    lines.push("## Skipped transactions (not imported)", "");
    for (const s of permanentSkips) lines.push(`- Transaction ${s.id}: ${s.reason}`);
    lines.push("");
  }

  const recPlan = buildRecurringPlan(snapshot, mapping);
  lines.push("## Recurring rules", "");
  if (recPlan.recurring.length === 0) {
    lines.push("No active recurring rules to import.", "");
  } else {
    lines.push(`${recPlan.recurring.length} recurring rule(s) will be created (they generate future transactions only — no history is backfilled):`, "");
    for (const r of recPlan.recurring) {
      const sched = describeSchedule({
        intervalUnit: r.intervalUnit,
        intervalCount: r.intervalCount,
        dayOfWeek: r.dayOfWeek,
        dayOfMonth: r.dayOfMonth,
        monthOfYear: r.monthOfYear,
        startDate: new Date(r.startDate),
        endDate: null,
        lastGeneratedDate: null,
      });
      lines.push(`- ${r.direction === "in" ? "Income" : "Expense"} £${(r.amountPence / 100).toFixed(2)} — ${sched} → ${r.categoryName}`);
    }
    lines.push("");
    lines.push("_Recurring import is best-effort (Akaunting churns its recurring records) — review these on the /recurring page before clicking \"generate due\"._");
    lines.push("");
  }
  if (recPlan.skipped.length > 0) {
    lines.push(`${recPlan.skipped.length} older/other recurring definition(s) skipped (superseded or unsupported).`, "");
  }

  lines.push("## Attachments", "");
  lines.push(
    `${snapshot.attachments.length} attachment reference(s) found. Files are not in the SQL dump — ` +
      "re-run apply with `--attachments-dir <path-to-akaunting-storage>` to copy them, or re-upload manually.",
    "",
  );

  const gaps = Object.entries(snapshot.otherTableCounts).filter(([, n]) => n > 0);
  lines.push("## What's missing (not migrated)", "");
  if (gaps.length === 0) {
    lines.push("No Akaunting features outside Quidly's model were found.", "");
  } else {
    for (const [table, n] of gaps) {
      const why = GAP_EXPLANATIONS[table] ?? "No equivalent in Quidly.";
      lines.push(`- **${table}** (${n} rows): ${why}`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}
