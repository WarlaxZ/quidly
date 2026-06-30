import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attemptLogin } from "./login";
import { hashPassword } from "./password";
import { recordAttempt, recentAttempts } from "../data/loginAttempts";
import { resetDb } from "../../../test/setup/resetDb";

beforeAll(async () => {
  process.env.AUTH_USERNAME = "alice";
  process.env.AUTH_PASSWORD_HASH = await hashPassword("s3cret-pass");
});
beforeEach(async () => { await resetDb(); });

describe("attemptLogin", () => {
  it("succeeds with correct credentials and clears prior failures", async () => {
    await recordAttempt("failure", null);
    const r = await attemptLogin({ username: "alice", password: "s3cret-pass", ip: null });
    expect(r.ok).toBe(true);
    const after = await recentAttempts(60_000);
    expect(after.filter((a) => a.outcome === "failure")).toHaveLength(0);
    expect(after.some((a) => a.outcome === "success")).toBe(true);
  });
  it("rejects a wrong password and records a failure", async () => {
    const r = await attemptLogin({ username: "alice", password: "nope", ip: null });
    expect(r).toEqual({ ok: false, reason: "invalid" });
    const after = await recentAttempts(60_000);
    expect(after.filter((a) => a.outcome === "failure")).toHaveLength(1);
  });
  it("rejects a wrong username", async () => {
    const r = await attemptLogin({ username: "mallory", password: "s3cret-pass", ip: null });
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });
  it("locks out after 5 failures in the window", async () => {
    for (let i = 0; i < 5; i++) await attemptLogin({ username: "alice", password: "nope", ip: null });
    const r = await attemptLogin({ username: "alice", password: "s3cret-pass", ip: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("locked");
  });
});
