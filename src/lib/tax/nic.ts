/** UK Class 1 National Insurance — employer (secondary) and employee (primary).
 *  v1 rates are per-year basis-point config; VERIFY against HMRC each April. */

export interface NICRates {
  secondaryThresholdPence: number;   // employer NIC starts above this
  secondaryBps: number;              // employer rate (1500 = 15%)
  primaryThresholdPence: number;     // employee NIC starts above this
  uelPence: number;                  // upper earnings limit
  mainBps: number;                   // employee rate PT→UEL (800 = 8%)
  upperBps: number;                  // employee rate above UEL (200 = 2%)
  employmentAllowancePence: number;  // max employer-NIC waiver (if eligible)
}

const NIC_2025_26: NICRates = {
  secondaryThresholdPence: 5_000_00,
  secondaryBps: 1500,
  primaryThresholdPence: 12_570_00,
  uelPence: 50_270_00,
  mainBps: 800,
  upperBps: 200,
  employmentAllowancePence: 10_500_00,
};

const NIC_2026_27: NICRates = {
  // Unchanged from 2025-26.
  secondaryThresholdPence: 5_000_00,
  secondaryBps: 1500,
  primaryThresholdPence: 12_570_00,
  uelPence: 50_270_00,
  mainBps: 800,
  upperBps: 200,
  employmentAllowancePence: 10_500_00,
};

const NIC_RATES: Record<string, NICRates> = { "2025-26": NIC_2025_26, "2026-27": NIC_2026_27 };
const LATEST_YEAR = "2026-27";

export function nicRates(year: string): NICRates {
  return NIC_RATES[year] ?? NIC_RATES[LATEST_YEAR];
}

/** Employer (secondary) Class 1 NIC on an annual salary. `employmentAllowancePence` (default 0)
 *  is waived off the result — a sole-director company is NOT eligible, so callers pass 0 by default. */
export function employerNIC(salaryPence: number, year: string, employmentAllowancePence = 0): number {
  const r = nicRates(year);
  const raw = Math.round((Math.max(0, salaryPence - r.secondaryThresholdPence) * r.secondaryBps) / 10000);
  return Math.max(0, raw - employmentAllowancePence);
}

/** Employee (primary) Class 1 NIC on an annual salary. */
export function employeeNIC(salaryPence: number, year: string): number {
  const r = nicRates(year);
  const mainBand = Math.max(0, Math.min(salaryPence, r.uelPence) - r.primaryThresholdPence);
  const upperBand = Math.max(0, salaryPence - r.uelPence);
  return Math.round((mainBand * r.mainBps) / 10000) + Math.round((upperBand * r.upperBps) / 10000);
}
