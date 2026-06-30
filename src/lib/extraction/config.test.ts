import { afterEach, describe, expect, it } from "vitest";
import { isExtractionEnabled, getExtractionModel } from "./config";

const orig = { key: process.env.ANTHROPIC_API_KEY, model: process.env.EXTRACTION_MODEL };
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = orig.key;
  process.env.EXTRACTION_MODEL = orig.model;
});

describe("extraction config", () => {
  it("is disabled without an API key and enabled with one", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isExtractionEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(isExtractionEnabled()).toBe(true);
  });
  it("defaults the model and allows override", () => {
    delete process.env.EXTRACTION_MODEL;
    expect(getExtractionModel()).toBe("claude-haiku-4-5-20251001");
    process.env.EXTRACTION_MODEL = "claude-sonnet-4-6";
    expect(getExtractionModel()).toBe("claude-sonnet-4-6");
  });
});
