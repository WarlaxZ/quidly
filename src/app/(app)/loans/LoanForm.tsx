import { MoneyInput } from "../_ui/MoneyInput";

export interface LoanFormValues {
  id?: string;
  name: string;
  kind: "interestOnly" | "repayment";
  openingBalancePence: number;
  annualRateBps: number;
  scheduledPaymentPence: number;
  intervalUnit: string;
  intervalCount: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: Date;
  termEndDate: Date | null;
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export function LoanForm({
  action,
  properties,
  activePropertyId,
  isAll,
  submitLabel,
  values,
}: {
  action: (formData: FormData) => void | Promise<void>;
  properties: { id: string; name: string }[];
  activePropertyId: string | null;
  isAll: boolean;
  submitLabel: string;
  values?: LoanFormValues;
}) {
  return (
    <form action={action} className="card space-y-4 p-5">
      {values?.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Property</span>
          {isAll || !activePropertyId ? (
            <select name="propertyId" required className="field" defaultValue={activePropertyId ?? ""}>
              <option value="">Choose a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="propertyId" value={activePropertyId} />
              <div className="field bg-surface-sunk">
                {properties.find((p) => p.id === activePropertyId)?.name ?? "—"}
              </div>
            </>
          )}
        </label>

        <label className="block">
          <span className="label">Name</span>
          <input name="name" required className="field" placeholder="Santander BTL" defaultValue={values?.name ?? ""} />
        </label>

        <label className="block">
          <span className="label">Type</span>
          <select name="kind" required className="field" defaultValue={values?.kind ?? "interestOnly"}>
            <option value="interestOnly">Interest-only</option>
            <option value="repayment">Repayment</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Outstanding balance</span>
          <MoneyInput name="openingBalance" required defaultValue={values ? (values.openingBalancePence / 100).toFixed(2) : ""} />
          <span className="mt-1 block text-xs text-muted">The balance as at the start date below.</span>
        </label>

        <label className="block">
          <span className="label">Interest rate (%)</span>
          <input
            name="annualRate" required inputMode="decimal" className="field" placeholder="2.7"
            defaultValue={values ? (values.annualRateBps / 100).toString() : ""}
          />
        </label>

        <label className="block">
          <span className="label">Payment amount</span>
          <MoneyInput name="scheduledPayment" required defaultValue={values ? (values.scheduledPaymentPence / 100).toFixed(2) : ""} />
          <span className="mt-1 block text-xs text-muted">The full amount that leaves your bank, including any overpayment.</span>
        </label>

        <label className="block">
          <span className="label">Frequency</span>
          <select name="intervalUnit" className="field" defaultValue={values?.intervalUnit ?? "MONTH"}>
            <option value="MONTH">Monthly</option>
            <option value="WEEK">Weekly</option>
            <option value="YEAR">Yearly</option>
            <option value="DAY">Daily</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Every</span>
          <input name="intervalCount" type="number" min={1} className="field" defaultValue={values?.intervalCount ?? 1} />
        </label>

        <label className="block">
          <span className="label">Day of month</span>
          <input name="dayOfMonth" type="number" min={1} max={31} className="field" defaultValue={values?.dayOfMonth ?? 1} />
          <span className="mt-1 block text-xs text-muted">31 means the last day of the month.</span>
        </label>

        <label className="block">
          <span className="label">Day of week</span>
          <select name="dayOfWeek" className="field" defaultValue={values?.dayOfWeek ?? ""}>
            <option value="">—</option>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Weekly schedules only.</span>
        </label>

        <label className="block">
          <span className="label">Month</span>
          <input name="monthOfYear" type="number" min={1} max={12} className="field" defaultValue={values?.monthOfYear ?? ""} />
          <span className="mt-1 block text-xs text-muted">Yearly schedules only.</span>
        </label>

        <label className="block">
          <span className="label">First payment from</span>
          <input name="startDate" type="date" required className="field" defaultValue={iso(values?.startDate ?? null)} />
          <span className="mt-1 block text-xs text-muted">The balance above is as at this date, and interest accrues from it. Your first payment will be the next scheduled date after it.</span>
        </label>

        <label className="block">
          <span className="label">Term ends (optional)</span>
          <input name="termEndDate" type="date" className="field" defaultValue={iso(values?.termEndDate ?? null)} />
          <span className="mt-1 block text-xs text-muted">Interest-only loans get a warning about the balance due then.</span>
        </label>
      </div>

      <button type="submit" className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
