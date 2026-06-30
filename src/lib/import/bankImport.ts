import { parseAmountToPence } from "../money/parseAmount";
import type { Direction } from "../tax/types";

export interface ColumnMapping {
  dateCol: number;
  amountCol: number;
  descriptionCol: number;
}

export interface MappedRow {
  date: Date;
  amountPence: number;
  direction: Direction;
  description: string;
}

function parseUkDate(s: string): Date {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  throw new Error(`Unrecognised date: "${s}"`);
}

export function mapImportRow(row: string[], mapping: ColumnMapping): MappedRow {
  const date = parseUkDate((row[mapping.dateCol] ?? "").trim());
  const raw = (row[mapping.amountCol] ?? "").trim();
  const negative = raw.startsWith("-") || raw.startsWith("(");
  const magnitude = raw.replace(/[-()]/g, "");
  const amountPence = parseAmountToPence(magnitude);
  return {
    date,
    amountPence,
    direction: negative ? "out" : "in",
    description: (row[mapping.descriptionCol] ?? "").trim(),
  };
}

export function isDuplicate(
  candidate: { date: Date; amountPence: number; description: string },
  existing: { date: Date; amountPence: number; description: string | null }[],
): boolean {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return existing.some(
    (e) => day(e.date) === day(candidate.date) && e.amountPence === candidate.amountPence && (e.description ?? "") === candidate.description,
  );
}
