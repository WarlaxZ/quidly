/**
 * Convert an Akaunting decimal amount string (up to 4dp) to integer pence,
 * without ever going through a float. Rounds half-up at the pence boundary
 * using the THIRD decimal digit only — the 4th digit is intentionally ignored
 * (Akaunting stores DECIMAL(15,4) but money is 2dp; the 3rd digit is the tie-breaker).
 * Throws on empty input so a missing amount fails loudly rather than silently becoming 0.
 */
export function decimalStringToPence(amount: string): number {
  const trimmed = amount.trim();
  if (trimmed === "") throw new Error("decimalStringToPence: empty amount");
  const neg = trimmed.startsWith("-");
  const clean = trimmed.replace(/^[-+]/, "");
  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const thirdDigit = frac.charAt(2);
  let pence = Number(whole || "0") * 100 + Number(fracPadded);
  if (thirdDigit !== "" && Number(thirdDigit) >= 5) pence += 1;
  return neg ? -pence : pence;
}
