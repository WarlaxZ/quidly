import type { ReactNode } from "react";

const VARIANTS = {
  error: "border-negative/30 bg-negative-soft text-negative",
  success: "border-forest/25 bg-[#e8efe9] text-forest",
  info: "border-line bg-surface text-muted",
} as const;

export function Banner({ variant, children }: { variant: keyof typeof VARIANTS; children: ReactNode }) {
  return <p className={`reveal rounded-lg border px-4 py-3 text-sm ${VARIANTS[variant]}`}>{children}</p>;
}
