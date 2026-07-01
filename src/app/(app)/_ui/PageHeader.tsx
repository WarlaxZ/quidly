import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="reveal flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[2rem] leading-none text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-1.5">{children}</div>}
    </header>
  );
}
