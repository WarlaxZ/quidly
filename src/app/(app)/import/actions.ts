"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/session";
import { listTransactions, bulkCreateTransactions } from "../../../lib/data/transactions";
import { parseCsv } from "../../../lib/reports/csv";
import { mapImportRow, isDuplicate, type ColumnMapping, type MappedRow } from "../../../lib/import/bankImport";
import { matchLoanPayment } from "../../../lib/import/loanMatch";
import { loanPaymentCandidates } from "../../../lib/data/loanGeneration";
import { selectRowsToImport } from "../../../lib/import/selectRows";

export interface PreviewRow {
  ok: boolean; date?: string; direction?: string; amountPence?: number;
  description?: string; error?: string; duplicate?: boolean;
  /** Set when this debit looks like a payment on one of the property's loans. */
  loanMatch?: { loanId: string; name: string };
}

export async function buildPreview(csvText: string, mapping: ColumnMapping, propertyId: string): Promise<PreviewRow[]> {
  await requireSession();
  const existing = await listTransactions(propertyId);
  const { rows } = parseCsv(csvText);

  const parsed = rows.map((row) => {
    try { return { m: mapImportRow(row, mapping) }; }
    catch (e) { return { error: (e as Error).message }; }
  });

  // Walk occurrences only as far as the statement actually goes.
  const latest = parsed.reduce<Date | null>(
    (max, p) => (p.m && (!max || p.m.date > max) ? p.m.date : max), null,
  );
  const candidates = latest ? await loanPaymentCandidates(propertyId, latest) : [];

  return parsed.map((p) => {
    if (!p.m) return { ok: false, error: p.error };
    const match = matchLoanPayment(p.m, candidates);
    return {
      ok: true,
      date: p.m.date.toISOString().slice(0, 10),
      direction: p.m.direction,
      amountPence: p.m.amountPence,
      description: p.m.description,
      duplicate: isDuplicate(p.m, existing),
      ...(match ? { loanMatch: { loanId: match.loanId, name: match.name } } : {}),
    };
  });
}

export async function confirmImportAction(formData: FormData) {
  await requireSession();
  const csvText = String(formData.get("csv") ?? "");
  const categoryId = String(formData.get("categoryId"));
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) redirect(`/import?error=${encodeURIComponent("Choose a property.")}`);
  const mapping: ColumnMapping = {
    dateCol: Number(formData.get("dateCol")),
    amountCol: Number(formData.get("amountCol")),
    descriptionCol: Number(formData.get("descriptionCol")),
  };
  const includeLoanMatches = String(formData.get("includeLoanMatches") ?? "") === "true";
  const existing = await listTransactions(propertyId);
  const { rows } = parseCsv(csvText);
  const mapped: MappedRow[] = [];
  for (const row of rows) {
    try { mapped.push(mapImportRow(row, mapping)); } catch { continue; }
  }

  // Bounded by the latest row's date, exactly as buildPreview does — walking further would
  // surface scheduled dates the statement can't possibly corroborate.
  const latest = mapped.reduce<Date | null>((max, m) => (!max || m.date > max ? m.date : max), null);
  const candidates = latest ? await loanPaymentCandidates(propertyId, latest) : [];

  const toImport = selectRowsToImport(mapped, existing, candidates, includeLoanMatches);
  const toCreate = toImport.map((m) => ({
    propertyId, categoryId, date: m.date, amountPence: m.amountPence, direction: m.direction, description: m.description,
  }));
  await bulkCreateTransactions(toCreate);
  revalidatePath("/transactions");
  redirect("/transactions");
}
