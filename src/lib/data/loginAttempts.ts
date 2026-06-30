import "server-only";
import { prisma } from "../db";

export function recordAttempt(outcome: "success" | "failure", ip: string | null) {
  return prisma.loginAttempt.create({ data: { outcome, ip } });
}
export function recentAttempts(windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  return prisma.loginAttempt.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
}
export async function clearFailures() {
  await prisma.loginAttempt.deleteMany({ where: { outcome: "failure" } });
}
