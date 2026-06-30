import { describe, expect, it } from "vitest";
import { evaluateLockout, DEFAULT_LOCKOUT } from "./lockout";

const fail = (msAgo: number, now: number) => ({ outcome: "failure" as const, createdAt: new Date(now - msAgo) });

describe("evaluateLockout", () => {
  const now = new Date("2026-06-30T12:00:00Z");
  const t = now.getTime();
  it("is unlocked below the failure threshold", () => {
    const attempts = [fail(1000, t), fail(2000, t), fail(3000, t), fail(4000, t)];
    expect(evaluateLockout(attempts, now).locked).toBe(false);
  });
  it("locks after maxFailures within the window", () => {
    const attempts = Array.from({ length: 5 }, (_, i) => fail(1000 * (i + 1), t));
    const r = evaluateLockout(attempts, now);
    expect(r.locked).toBe(true);
    expect(r.lockedUntil).toBeInstanceOf(Date);
  });
  it("ignores failures older than the window", () => {
    const old = DEFAULT_LOCKOUT.windowMs + 1000;
    const attempts = Array.from({ length: 5 }, () => fail(old, t));
    expect(evaluateLockout(attempts, now).locked).toBe(false);
  });
  it("unlocks once the cooldown has elapsed", () => {
    const attempts = Array.from({ length: 5 }, () => fail(DEFAULT_LOCKOUT.cooldownMs + 1000, t));
    expect(evaluateLockout(attempts, now).locked).toBe(false);
  });
});
