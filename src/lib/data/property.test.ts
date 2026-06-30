import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateDefaultProperty, updateProperty } from "./property";
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
