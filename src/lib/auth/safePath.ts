const SENTINEL = "http://internal.invalid";

/**
 * Reduce a user-supplied post-login redirect target to a safe, same-origin path.
 * Resolves `next` against a sentinel origin; anything that escapes that origin
 * (absolute URLs, protocol-relative `//host`, backslash tricks `/\host` that the
 * URL parser normalises to a host) is rejected in favour of `/dashboard`.
 */
export function safePath(next: string): string {
  if (!next || !next.startsWith("/")) return "/dashboard";
  try {
    const url = new URL(next, SENTINEL);
    if (url.origin !== SENTINEL) return "/dashboard";
    return url.pathname + url.search;
  } catch {
    return "/dashboard";
  }
}
