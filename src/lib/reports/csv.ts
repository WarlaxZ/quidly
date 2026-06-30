type Row = Record<string, string | number>;

function escape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function toCsv(columns: string[], rows: Row[]): string {
  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((c) => escape(row[c] ?? "")).join(","));
  return [header, ...body].join("\n");
}
