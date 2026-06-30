type Row = Record<string, string | number>;

const FORMULA_LEADERS = /^[=+\-@\t\r]/;

function escape(value: string | number): string {
  let s = String(value);
  // Neutralise spreadsheet formula injection: a field beginning with = + - @ (or tab/CR)
  // is evaluated as a formula by Excel/LibreOffice even when CSV-quoted, so prefix it with
  // a single quote to force text interpretation.
  if (FORMULA_LEADERS.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(columns: string[], rows: Row[]): string {
  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((c) => escape(row[c] ?? "")).join(","));
  return [header, ...body].join("\n");
}
