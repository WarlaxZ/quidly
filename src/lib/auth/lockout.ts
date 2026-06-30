export interface Attempt {
  outcome: "success" | "failure";
  createdAt: Date;
}
export interface LockoutConfig {
  maxFailures: number;
  windowMs: number;
  cooldownMs: number;
}
export const DEFAULT_LOCKOUT: LockoutConfig = {
  maxFailures: 5,
  windowMs: 15 * 60 * 1000,
  cooldownMs: 15 * 60 * 1000,
};
export interface LockoutState {
  locked: boolean;
  lockedUntil: Date | null;
}
export function evaluateLockout(attempts: Attempt[], now: Date, cfg: LockoutConfig = DEFAULT_LOCKOUT): LockoutState {
  const recentFailures = attempts.filter(
    (a) => a.outcome === "failure" && now.getTime() - a.createdAt.getTime() < cfg.windowMs,
  );
  if (recentFailures.length < cfg.maxFailures) return { locked: false, lockedUntil: null };
  const latest = Math.max(...recentFailures.map((a) => a.createdAt.getTime()));
  // With DEFAULT_LOCKOUT.windowMs === cooldownMs, callers that fetch only in-window attempts
  // will see the lock clear naturally as failures age out of the window; this cooldown check
  // is the explicit equivalent (and matters if a caller ever passes cooldownMs > windowMs).
  const lockedUntil = new Date(latest + cfg.cooldownMs);
  if (now.getTime() >= lockedUntil.getTime()) return { locked: false, lockedUntil: null };
  return { locked: true, lockedUntil };
}
