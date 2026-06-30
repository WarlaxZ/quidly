export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  text = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { records.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushField(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushField(); pushRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length > 0) { pushField(); pushRow(); }

  const [header = [], ...rows] = records;
  return { header, rows };
}

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
