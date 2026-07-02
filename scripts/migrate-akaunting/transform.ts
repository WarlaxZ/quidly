/**
 * Convert an Akaunting decimal amount string (up to 4dp) to integer pence,
 * without ever going through a float. Rounds half-up at the pence boundary
 * using the third decimal digit.
 */
export function decimalStringToPence(amount: string): number {
  const trimmed = amount.trim();
  const neg = trimmed.startsWith("-");
  const clean = trimmed.replace(/^[-+]/, "");
  const [whole, frac = ""] = clean.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const thirdDigit = frac.charAt(2);
  let pence = Number(whole || "0") * 100 + Number(fracPadded || "0");
  if (thirdDigit !== "" && Number(thirdDigit) >= 5) pence += 1;
  return neg ? -pence : pence;
}
