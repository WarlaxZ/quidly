import Anthropic from "@anthropic-ai/sdk";
import { getExtractionModel } from "./config";
import { poundsToPence } from "../tax/money";

export interface AnthropicLike {
  messages: { create: (params: unknown) => Promise<{ content: Array<{ type: string; input?: unknown }> }> };
}

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

export async function extractReceipt(bytes: Buffer, mimeType: string, categories: CategoryRef[], client?: AnthropicLike): Promise<Extraction> {
  const c: AnthropicLike = client ?? (new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as unknown as AnthropicLike);
  const tool = buildExtractionTool(categories);
  const data = bytes.toString("base64");
  const fileBlock =
    mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data } };

  const res = await c.messages.create({
    model: getExtractionModel(),
    max_tokens: 1024,
    system: [{ type: "text", text: "You extract structured transaction data from UK receipts and invoices. Always call record_receipt. Dates as YYYY-MM-DD; amount is the total in pounds.", cache_control: { type: "ephemeral" } }],
    tools: [{ ...tool, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: "record_receipt" },
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Extract the receipt details." }] }],
  } as unknown as Anthropic.MessageCreateParams);

  const toolUse = (res.content ?? []).find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("The model did not return structured data — try a clearer image.");
  return parseExtraction(toolUse.input, categories);
}
