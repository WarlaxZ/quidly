import { afterAll, describe, expect, it } from "vitest";
import { rm, readFile } from "node:fs/promises";
import { validateUpload, saveUpload } from "./files";

afterAll(async () => { await rm("uploads", { recursive: true, force: true }); });

describe("validateUpload", () => {
  it("accepts allowed types within the size cap", () => {
    expect(() => validateUpload("image/jpeg", 1000)).not.toThrow();
    expect(() => validateUpload("application/pdf", 1000)).not.toThrow();
  });
  it("rejects disallowed types and oversize files", () => {
    expect(() => validateUpload("image/gif", 1000)).toThrow();
    expect(() => validateUpload("image/jpeg", 11 * 1024 * 1024)).toThrow();
  });
});

describe("saveUpload", () => {
  it("writes the bytes and returns a path + original name", async () => {
    const bytes = Buffer.from("hello receipt");
    const saved = await saveUpload(bytes, "receipt.jpg", "image/jpeg");
    expect(saved.originalName).toBe("receipt.jpg");
    expect(saved.filePath.endsWith(".jpg")).toBe(true);
    expect((await readFile(saved.filePath)).toString()).toBe("hello receipt");
  });
});
