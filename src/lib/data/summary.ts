import "server-only";
import { listTransactionsForTaxYear } from "./transactions";
import { getOrCreateProfile } from "./taxProfile";
import { toTaxTxn } from "../tax/fromPrisma";
import { buildTaxYearSummary, type TaxYearSummary } from "../tax/summary";
import type { Region } from "../tax/types";

export async function getTaxYearSummary(
  propertyId: string,
  taxYear: string,
): Promise<{ summary: TaxYearSummary; otherIncomePence: number; region: Region; usePropertyAllowance: boolean }> {
  const [rows, profile] = await Promise.all([
    listTransactionsForTaxYear(propertyId, taxYear),
    getOrCreateProfile(taxYear),
  ]);
  const txns = rows.map((r) => toTaxTxn(r));
  const summary = buildTaxYearSummary(txns, {
    taxYear,
    otherIncomePence: profile.otherIncomePence,
    region: profile.region as Region,
    usePropertyAllowance: profile.usePropertyAllowance,
  });
  return {
    summary,
    otherIncomePence: profile.otherIncomePence,
    region: profile.region as Region,
    usePropertyAllowance: profile.usePropertyAllowance,
  };
}
