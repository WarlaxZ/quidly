/** All monetary values in this app are integer pence. Never use floats for money. */

export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function penceToPounds(pence: number): number {
  if (!Number.isInteger(pence)) {
    throw new Error(`penceToPounds: expected integer pence, got ${pence}`);
  }
  return pence / 100;
}

export function formatGBP(pence: number): string {
  const pounds = penceToPounds(pence);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pounds);
}
