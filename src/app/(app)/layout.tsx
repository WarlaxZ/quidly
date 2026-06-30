import Link from "next/link";
import type { ReactNode } from "react";
import { isExtractionEnabled } from "../../lib/extraction/config";
import { listProperties, getActiveProperty } from "../../lib/data/activeProperty";
import { PropertySwitcher } from "./PropertySwitcher";
export default async function AppLayout({ children }: { children: ReactNode }) {
  const nav = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/transactions", label: "Transactions" },
    { href: "/import", label: "Import" },
    ...(isExtractionEnabled() ? [{ href: "/scan", label: "Scan" }] : []),
    { href: "/recurring", label: "Recurring" },
    { href: "/sa105", label: "SA105" },
    { href: "/vendors", label: "Vendors" },
    { href: "/settings", label: "Settings" },
    { href: "/properties", label: "Properties" },
  ];
  const properties = await listProperties();
  const active = await getActiveProperty();
  const activeValue = active.isAll ? "all" : (active.propertyId ?? "");
  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 border-b px-6 py-4">
        <span className="font-semibold">Property Accounts</span>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="text-blue-600 hover:underline">{n.label}</Link>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {properties.length > 0 && <PropertySwitcher properties={properties} activeValue={activeValue} />}
          <form method="post" action="/api/logout">
            <button type="submit" className="text-gray-600 hover:underline">Log out</button>
          </form>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
