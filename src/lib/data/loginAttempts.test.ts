import { beforeEach, describe, expect, it } from "vitest";
import { recordAttempt, recentAttempts, clearFailures } from "./loginAttempts";
import { resetDb } from "../../../test/setup/resetDb";

beforeEach(async () => { await resetDb(); });

describe("login attempts data layer", () => {
  it("records and reads back recent attempts", async () => {
    await recordAttempt("failure", "1.2.3.4");
    await recordAttempt("success", "1.2.3.4");
    const attempts = await recentAttempts(60_000);
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.outcome).sort()).toEqual(["failure", "success"]);
  });
  it("clears failures (but keeps successes)", async () => {
    await recordAttempt("failure", null);
    await recordAttempt("success", null);
    await clearFailures();
    const attempts = await recentAttempts(60_000);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe("success");
  });
});
