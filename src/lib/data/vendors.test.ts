import { beforeEach, describe, expect, it } from "vitest";
import { createVendor, listVendors, updateVendor, deleteVendor } from "./vendors";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("vendors data layer", () => {
  it("fetches a single vendor by id", async () => {
    const v = await createVendor({ name: "Acme" });
    const { getVendor } = await import("./vendors");
    expect((await getVendor(v.id))?.name).toBe("Acme");
    expect(await getVendor("nope")).toBeNull();
  });
  it("creates and lists vendors alphabetically", async () => {
    await createVendor({ name: "Zen Plumbing" });
    await createVendor({ name: "Acme Lettings" });
    const vendors = await listVendors();
    expect(vendors.map((v) => v.name)).toEqual(["Acme Lettings", "Zen Plumbing"]);
  });
  it("updates a vendor", async () => {
    const v = await createVendor({ name: "Old Name" });
    await updateVendor(v.id, { name: "New Name", notes: "preferred" });
    const [updated] = await listVendors();
    expect(updated.name).toBe("New Name");
    expect(updated.notes).toBe("preferred");
  });
  it("deletes a vendor", async () => {
    const v = await createVendor({ name: "Temp" });
    await deleteVendor(v.id);
    expect(await listVendors()).toHaveLength(0);
  });
});
