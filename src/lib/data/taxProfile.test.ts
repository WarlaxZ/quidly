import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateProfile, updateProfile } from "./taxProfile";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("tax year profile", () => {
  it("creates a default profile for a tax year and reuses it", async () => {
    const a = await getOrCreateProfile("2025-26");
    const b = await getOrCreateProfile("2025-26");
    expect(a.id).toBe(b.id);
    expect(a.otherIncomePence).toBe(0);
    expect(a.region).toBe("englandWalesNI");
    expect(a.usePropertyAllowance).toBe(false);
  });
  it("updates the profile", async () => {
    await getOrCreateProfile("2025-26");
    await updateProfile("2025-26", { otherIncomePence: 4_000_000, usePropertyAllowance: true });
    const p = await getOrCreateProfile("2025-26");
    expect(p.otherIncomePence).toBe(4_000_000);
    expect(p.usePropertyAllowance).toBe(true);
  });
});
