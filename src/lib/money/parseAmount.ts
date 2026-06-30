/** Parse a user-entered pounds string into a positive integer number of pence. */
export function parseAmountToPence(input: string): number {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (cleaned === "") throw new Error("Amount is required");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: "${input}"`);
  }
  const [pounds, fraction = ""] = cleaned.split(".");
  const pence = Number(pounds) * 100 + Number(fraction.padEnd(2, "0"));
  if (pence === 0) throw new Error("Amount must be greater than zero");
  return pence;
}
