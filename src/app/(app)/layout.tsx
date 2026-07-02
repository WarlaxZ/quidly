import type { ReactNode } from "react";
import { isExtractionEnabled } from "../../lib/extraction/config";
import { listProperties, getActiveProperty } from "../../lib/data/activeProperty";
import { PropertySwitcher } from "./PropertySwitcher";
import { SideNav, type NavGroup } from "./SideNav";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const groups: NavGroup[] = [
    { items: [{ href: "/dashboard", label: "Dashboard" }] },
    {
      heading: "Bookkeeping",
      items: [
        { href: "/transactions", label: "Transactions" },
        { href: "/recurring", label: "Recurring" },
        { href: "/import", label: "Import" },
        ...(isExtractionEnabled() ? [{ href: "/scan", label: "Scan a receipt" }] : []),
      ],
    },
    {
      heading: "Tax",
      items: [
        { href: "/deductions", label: "Deductions" },
        { href: "/sa105", label: "SA105" },
        { href: "/planner", label: "What-if planner" },
        { href: "/extraction", label: "Salary vs dividends" },
      ],
    },
    {
      heading: "Manage",
      items: [
        { href: "/properties", label: "Properties" },
        { href: "/companies", label: "Companies" },
        { href: "/vendors", label: "Vendors" },
        { href: "/settings", label: "Settings" },
      ],
    },
  ];

  const properties = await listProperties();
  const active = await getActiveProperty();
  const activeValue = active.isAll ? "all" : (active.propertyId ?? "");

  return (
    <div className="md:flex md:min-h-screen">
      <MobileNav groups={groups} properties={properties} activeValue={activeValue} />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface/70 px-4 py-5 backdrop-blur md:flex">
        {/* Wordmark */}
        <div className="mb-7 flex items-center gap-2.5 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-forest text-forest-ink shadow-[0_4px_12px_-4px_rgba(31,61,48,.6)]">
            <span className="font-display text-lg leading-none">£</span>
          </span>
          <span className="font-display text-[1.35rem] font-semibold leading-none text-ink">Quidly</span>
        </div>

        <SideNav groups={groups} />

        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
          <ThemeToggle />
          {properties.length > 0 && (
            <div>
              <span className="mb-1.5 block px-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-faint">Viewing</span>
              <PropertySwitcher properties={properties} activeValue={activeValue} />
            </div>
          )}
          <form method="post" action="/api/logout">
            <button type="submit" className="w-full rounded-[9px] px-3 py-2 text-left text-[0.85rem] font-medium text-muted transition-colors hover:bg-surface-sunk hover:text-ink">
              Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
