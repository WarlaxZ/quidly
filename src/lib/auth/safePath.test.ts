import { describe, expect, it } from "vitest";
import { safePath } from "./safePath";

describe("safePath", () => {
  it("allows a normal local path (with query)", () => {
    expect(safePath("/transactions")).toBe("/transactions");
    expect(safePath("/dashboard?ty=2025-26")).toBe("/dashboard?ty=2025-26");
  });
  it("falls back to /dashboard for empty or non-slash input", () => {
    expect(safePath("")).toBe("/dashboard");
    expect(safePath("dashboard")).toBe("/dashboard");
  });
  it("blocks protocol-relative and absolute URLs", () => {
    expect(safePath("//evil.com")).toBe("/dashboard");
    expect(safePath("https://evil.com")).toBe("/dashboard");
    expect(safePath("http://evil.com/path")).toBe("/dashboard");
  });
  it("blocks the backslash bypass that URL normalises to a host", () => {
    expect(safePath("/\\evil.com")).toBe("/dashboard");
    expect(safePath("/\\/evil.com")).toBe("/dashboard");
  });
});
