"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string }
export interface NavGroup { heading?: string; items: NavItem[] }

export function SideNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex flex-col gap-5">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {group.heading && (
            <div className="px-3 pb-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-faint">
              {group.heading}
            </div>
          )}
          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center rounded-[9px] px-3 py-[0.42rem] text-[0.9rem] transition-colors ${
                  active
                    ? "bg-surface-sunk font-semibold text-forest"
                    : "font-medium text-muted hover:bg-surface-sunk hover:text-ink"
                }`}
              >
                <span
                  className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-ochre transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
