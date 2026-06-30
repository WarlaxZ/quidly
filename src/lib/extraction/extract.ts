import { poundsToPence } from "../tax/money";

export interface CategoryRef {
  id: string;
  name: string;
}

export interface Extraction {
  vendorName: string;
  isoDate: string | null;
  amountPence: number;
  direction: "in" | "out";
  categoryId: string | null;
  confidence: "high" | "medium" | "low";
}

export function buildExtractionTool(categories: CategoryRef[]) {
  return {
    name: "record_receipt",
    description: "Record structured details extracted from a UK receipt or invoice.",
    input_schema: {
      type: "object" as const,
      properties: {
        vendorName: { type: "string", description: "Merchant / supplier name." },
        date: { type: "string", description: "Transaction date as YYYY-MM-DD." },
        amount: { type: "number", description: "Total amount in pounds, e.g. 19.99." },
        direction: { type: "string", enum: ["in", "out"], description: "'out' for money spent (most receipts); 'in' for income." },
        categoryId: { type: "string", enum: categories.map((c) => c.id), description: "Best-matching category id. Options: " + categories.map((c) => `${c.id}=${c.name}`).join("; ") },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["vendorName", "amount", "direction", "confidence"],
    },
  };
}

export function parseExtraction(input: unknown, categories: CategoryRef[]): Extraction {
  const o = (input ?? {}) as Record<string, unknown>;
  const amountNum = typeof o.amount === "number" ? o.amount : Number(o.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error("Couldn't read a valid amount from the receipt.");
  }
  const validIds = new Set(categories.map((c) => c.id));
  return {
    vendorName: typeof o.vendorName === "string" ? o.vendorName.trim() : "",
    isoDate: typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null,
    amountPence: poundsToPence(amountNum),
    direction: o.direction === "in" ? "in" : "out",
    categoryId: typeof o.categoryId === "string" && validIds.has(o.categoryId) ? o.categoryId : null,
    confidence: o.confidence === "high" || o.confidence === "medium" ? o.confidence : "low",
  };
}
