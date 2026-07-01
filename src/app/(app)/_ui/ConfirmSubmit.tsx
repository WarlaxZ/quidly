"use client";
import type { ReactNode } from "react";

export function ConfirmSubmit({ children, confirm = "Are you sure?", className }: { children: ReactNode; confirm?: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className ?? "text-sm font-medium text-negative transition-colors hover:text-negative/80"}
      onClick={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
