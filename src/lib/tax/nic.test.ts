import { describe, expect, it } from "vitest";
import { employerNIC, employeeNIC } from "./nic";

describe("employerNIC (2025-26, 15% above £5,000)", () => {
  it("is zero at/below the secondary threshold", () => {
    expect(employerNIC(5_000_00, "2025-26")).toBe(0);
    expect(employerNIC(4_000_00, "2025-26")).toBe(0);
  });
  it("is 15% of pay above £5,000", () => {
    // (12,570 − 5,000) × 15% = 1,135.50
    expect(employerNIC(12_570_00, "2025-26")).toBe(1_135_50);
  });
  it("is reduced by an Employment Allowance budget (to zero when covered)", () => {
    expect(employerNIC(12_570_00, "2025-26", 10_500_00)).toBe(0);
  });
  it("falls back to the latest year for an unknown year", () => {
    expect(employerNIC(12_570_00, "2099-00")).toBe(1_135_50);
  });
});

describe("employeeNIC (2025-26, 8% PT→UEL, 2% above)", () => {
  it("is zero at/below the £12,570 primary threshold", () => {
    expect(employeeNIC(12_570_00, "2025-26")).toBe(0);
    expect(employeeNIC(9_000_00, "2025-26")).toBe(0);
  });
  it("is 8% between the primary threshold and the UEL", () => {
    // (20,000 − 12,570) × 8% = 594.40
    expect(employeeNIC(20_000_00, "2025-26")).toBe(594_40);
  });
  it("adds 2% above the £50,270 UEL", () => {
    // (50,270 − 12,570) × 8% = 3,016.00 ; (60,000 − 50,270) × 2% = 194.60 ; total 3,210.60
    expect(employeeNIC(60_000_00, "2025-26")).toBe(3_210_60);
  });
});
