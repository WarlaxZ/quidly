import { requireSession } from "../../../../lib/auth/session";
import { getActiveProperty } from "../../../../lib/data/activeProperty";
import { listTransactionsFiltered } from "../../../../lib/data/transactions";
import type { TransactionFilter } from "../../../../lib/data/transactionFilter";
import { toCsv } from "../../../../lib/reports/csv";
import { penceToPounds } from "../../../../lib/tax/money";
import type { Direction } from "../../../../lib/tax/types";

export async function GET(request: Request) {
  await requireSession();
  const url = new URL(request.url);
  const active = await getActiveProperty();
  const filter: TransactionFilter = {
    taxYear: url.searchParams.get("taxYear") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    direction: (url.searchParams.get("direction") as Direction) || undefined,
  };
  const txns = await listTransactionsFiltered(active.propertyId, filter);
  const rows = txns.map((t) => ({
    property: t.property?.name ?? "",
    date: t.date.toISOString().slice(0, 10),
    direction: t.direction,
    category: t.category.name,
    vendor: t.vendor?.name ?? "",
    description: t.description ?? "",
    amount: penceToPounds(t.amountPence).toFixed(2),
  }));
  const csv = toCsv(["property", "date", "direction", "category", "vendor", "description", "amount"], rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions.csv"`,
    },
  });
}
