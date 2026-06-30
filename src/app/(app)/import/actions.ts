"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/session";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { listTransactions, bulkCreateTransactions } from "../../../lib/data/transactions";
import { parseCsv } from "../../../lib/reports/csv";
import { mapImportRow, isDuplicate, type ColumnMapping } from "../../../lib/import/bankImport";

export interface PreviewRow { ok: boolean; date?: string; direction?: string; amountPence?: number; description?: string; error?: string; duplicate?: boolean; }

export async function buildPreview(csvText: string, mapping: ColumnMapping): Promise<PreviewRow[]> {
  const property = await getOrCreateDefaultProperty();
  const existing = await listTransactions(property.id);
  const { rows } = parseCsv(csvText);
  return rows.map((row) => {
    try {
      const m = mapImportRow(row, mapping);
      return { ok: true, date: m.date.toISOString().slice(0, 10), direction: m.direction, amountPence: m.amountPence, description: m.description, duplicate: isDuplicate(m, existing) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}

export async function confirmImportAction(formData: FormData) {
  await requireSession();
  const csvText = String(formData.get("csv") ?? "");
  const categoryId = String(formData.get("categoryId"));
  const mapping: ColumnMapping = {
    dateCol: Number(formData.get("dateCol")),
    amountCol: Number(formData.get("amountCol")),
    descriptionCol: Number(formData.get("descriptionCol")),
  };
  const property = await getOrCreateDefaultProperty();
  const existing = await listTransactions(property.id);
  const { rows } = parseCsv(csvText);
  const toCreate = [];
  for (const row of rows) {
    let m;
    try { m = mapImportRow(row, mapping); } catch { continue; }
    if (isDuplicate(m, existing)) continue;
    toCreate.push({ propertyId: property.id, categoryId, date: m.date, amountPence: m.amountPence, direction: m.direction, description: m.description });
  }
  await bulkCreateTransactions(toCreate);
  revalidatePath("/transactions");
  redirect("/transactions");
}
