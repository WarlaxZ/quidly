import { beforeEach, describe, expect, it } from "vitest";
import { listCategories } from "./categories";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("listCategories", () => {
  it("returns the 11 seeded categories alphabetically", async () => {
    const cats = await listCategories();
    expect(cats).toHaveLength(11);
    const names = cats.map((c) => c.name);
    expect([...names]).toEqual([...names].sort());
  });
});
