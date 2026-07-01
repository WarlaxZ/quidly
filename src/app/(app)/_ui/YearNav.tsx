function shift(current: string | number, delta: number, key: "ty" | "year"): string {
  if (key === "year") return String(Number(current) + delta);
  const start = Number(String(current).slice(0, 4)) + delta;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function YearNav({ basePath, paramKey, current, label, extraQuery = {} }: {
  basePath: string; paramKey: "ty" | "year"; current: string | number; label: string; extraQuery?: Record<string, string>;
}) {
  const href = (val: string) => `${basePath}?${new URLSearchParams({ ...extraQuery, [paramKey]: val }).toString()}`;
  const arrow = "grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:border-forest hover:text-forest";
  return (
    <>
      <a href={href(shift(current, -1, paramKey))} className={arrow} aria-label={`Previous ${label}`}>‹</a>
      <span className="pill">{label} {current}</span>
      <a href={href(shift(current, 1, paramKey))} className={arrow} aria-label={`Next ${label}`}>›</a>
    </>
  );
}
