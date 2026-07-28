import { describe, expect, it } from "vitest";
import { prisma } from "../db";
import {
  INTEREST_CATEGORY_NAME, CAPITAL_CATEGORY_NAME,
  INTEREST_CATEGORY_KIND, CAPITAL_CATEGORY_KIND,
} from "./categories";

describe("loan categories are seeded with the kinds the tax engine relies on", () => {
  it("files interest as a finance cost against SA105 box 44", async () => {
    const c = await prisma.category.findUnique({ where: { name: INTEREST_CATEGORY_NAME } });
    expect(c).not.toBeNull();
    expect(c!.kind).toBe(INTEREST_CATEGORY_KIND);
    expect(c!.kind).toBe("finance");
    expect(c!.sa105Box).toBe("44");
    expect(c!.allowable).toBe(true);
  });

  it("files capital repayment as non-allowable capital with no SA105 box", async () => {
    const c = await prisma.category.findUnique({ where: { name: CAPITAL_CATEGORY_NAME } });
    expect(c).not.toBeNull();
    expect(c!.kind).toBe(CAPITAL_CATEGORY_KIND);
    expect(c!.kind).toBe("capital");
    // A box here would leak capital repayment into the SA105 — the exact bug this feature prevents.
    expect(c!.sa105Box).toBeNull();
    expect(c!.allowable).toBe(false);
  });

  it("keeps capital repayment distinct from capital improvements", async () => {
    // Improvements are deductible against a future capital gain (TCGA 1992 s.38);
    // loan principal never is. They must be separate rows, not one reused category.
    const repayment = await prisma.category.findUnique({ where: { name: CAPITAL_CATEGORY_NAME } });
    const improvements = await prisma.category.findUnique({ where: { name: "Capital improvements" } });
    expect(repayment).not.toBeNull();
    expect(improvements).not.toBeNull();
    expect(repayment!.id).not.toBe(improvements!.id);
  });
});
