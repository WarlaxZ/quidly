import "server-only";
import { verifyPassword } from "./password";
import { evaluateLockout, DEFAULT_LOCKOUT, type Attempt } from "./lockout";
import { recordAttempt, recentAttempts, clearFailures } from "../data/loginAttempts";

export type LoginResult =
  | { ok: true; username: string }
  | { ok: false; reason: "locked"; lockedUntil: Date }
  | { ok: false; reason: "invalid" };

export async function attemptLogin(input: { username: string; password: string; ip: string | null }): Promise<LoginResult> {
  const rows = await recentAttempts(DEFAULT_LOCKOUT.windowMs);
  const attempts: Attempt[] = rows.map((r) => ({ outcome: r.outcome as "success" | "failure", createdAt: r.createdAt }));
  const lock = evaluateLockout(attempts, new Date());
  if (lock.locked && lock.lockedUntil) return { ok: false, reason: "locked", lockedUntil: lock.lockedUntil };

  const expectedUser = process.env.AUTH_USERNAME ?? "";
  const expectedHash = process.env.AUTH_PASSWORD_HASH ?? "";
  // Always verify to keep timing roughly constant regardless of username correctness.
  const passOk = expectedHash ? await verifyPassword(expectedHash, input.password) : false;
  const userOk = expectedUser !== "" && input.username === expectedUser;

  if (userOk && passOk) {
    await recordAttempt("success", input.ip);
    await clearFailures();
    return { ok: true, username: input.username };
  }
  await recordAttempt("failure", input.ip);
  return { ok: false, reason: "invalid" };
}
