import Link from "next/link";
import type { ReactNode } from "react";
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/recurring", label: "Recurring" },
  { href: "/sa105", label: "SA105" },
  { href: "/vendors", label: "Vendors" },
  { href: "/settings", label: "Settings" },
];
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex gap-4 border-b px-6 py-4">
        <span className="font-semibold">Property Accounts</span>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="text-blue-600 hover:underline">{n.label}</Link>
        ))}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
