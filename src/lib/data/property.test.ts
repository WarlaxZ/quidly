import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateDefaultProperty, updateProperty, createProperty, getProperty, getPropertyCounts, deletePropertyIfEmpty } from "./property";
import { createTransaction } from "./transactions";
import { prisma } from "../db";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("property data layer", () => {
  it("creates a default property on first call and reuses it after", async () => {
    const a = await getOrCreateDefaultProperty();
    const b = await getOrCreateDefaultProperty();
    expect(a.id).toBe(b.id);
    expect(a.name).toBe("My Property");
  });
  it("updates the property", async () => {
    const p = await getOrCreateDefaultProperty();
    await updateProperty(p.id, { name: "12 Acacia Ave", address: "Anytown" });
    const updated = await getOrCreateDefaultProperty();
    expect(updated.name).toBe("12 Acacia Ave");
    expect(updated.address).toBe("Anytown");
  });
});

describe("property CRUD", () => {
  it("creates and fetches a property", async () => {
    const p = await createProperty({ name: "Flat 2", ownershipType: "personal" });
    expect((await getProperty(p.id))?.name).toBe("Flat 2");
  });
  it("deletes only when empty", async () => {
    const p = await createProperty({ name: "Empty" });
    const cat = await prisma.category.findFirstOrThrow({ where: { name: "Rent received" } });
    const p2 = await createProperty({ name: "Has data" });
    await createTransaction({ propertyId: p2.id, categoryId: cat.id, date: new Date("2025-06-01"), amountPence: 100, direction: "in" });
    expect((await getPropertyCounts(p2.id)).transactions).toBe(1);
    await expect(deletePropertyIfEmpty(p2.id)).rejects.toThrow();
    await deletePropertyIfEmpty(p.id);
    expect(await getProperty(p.id)).toBeNull();
  });
});
