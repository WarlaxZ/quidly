import type { InputHTMLAttributes } from "react";

export function MoneyInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">£</span>
      <input inputMode="decimal" {...rest} className={`field pl-7 ${className ?? ""}`} />
    </span>
  );
}
