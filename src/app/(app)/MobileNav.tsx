"use client";
import { useEffect, useState } from "react";
import { SideNav, type NavGroup } from "./SideNav";
import { PropertySwitcher } from "./PropertySwitcher";
import { ThemeToggle } from "./ThemeToggle";

export function MobileNav({ groups, properties, activeValue }: {
  groups: NavGroup[]; properties: { id: string; name: string }[]; activeValue: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-forest text-forest-ink"><span className="font-display text-lg leading-none">£</span></span>
          <span className="font-display text-base font-semibold text-ink">Property Accounts</span>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-ink" aria-label="Open menu">Menu</button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-surface px-4 py-5 shadow-[var(--shadow-raise)]">
            <button onClick={() => setOpen(false)} className="mb-4 self-end text-sm text-muted" aria-label="Close menu">Close ✕</button>
            <div onClick={() => setOpen(false)}><SideNav groups={groups} /></div>
            <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
              <ThemeToggle />
              {properties.length > 0 && <PropertySwitcher properties={properties} activeValue={activeValue} />}
              <form method="post" action="/api/logout"><button type="submit" className="text-left text-sm font-medium text-muted hover:text-ink">Log out</button></form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
