import { listRecurringRules } from "../../../lib/data/recurring";
import { getOrCreateDefaultProperty } from "../../../lib/data/property";
import { prisma } from "../../../lib/db";
import { formatGBP } from "../../../lib/tax/money";
import { addRecurringAction, deleteRecurringAction, generateNowAction } from "./actions";
export default async function RecurringPage() {
  const property = await getOrCreateDefaultProperty();
  const [rules, categories] = await Promise.all([
    listRecurringRules(property.id),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Recurring payments</h1>
      <form action={addRecurringAction} className="flex flex-wrap items-end gap-2">
        <input name="amount" placeholder="£ amount" required className="border px-2 py-1" />
        <select name="direction" className="border px-2 py-1">
          <option value="in">In</option><option value="out">Out</option>
        </select>
        <select name="categoryId" required className="border px-2 py-1">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="frequency" className="border px-2 py-1">
          <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
        </select>
        <input name="dayOfMonth" type="number" min="1" max="31" defaultValue="1" required className="w-20 border px-2 py-1" />
        <input name="startDate" type="date" required className="border px-2 py-1" />
        <input name="endDate" type="date" className="border px-2 py-1" />
        <button type="submit" className="bg-blue-600 px-3 py-1 text-white">Add rule</button>
      </form>
      <form action={generateNowAction}>
        <button type="submit" className="bg-green-700 px-3 py-1 text-white">Generate due transactions now</button>
      </form>
      <ul className="divide-y border">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-3 py-2">
            <span>{r.frequency} · {r.category.name} · {r.direction === "out" ? "−" : ""}{formatGBP(r.amountPence)} · day {r.dayOfMonth}</span>
            <form action={deleteRecurringAction}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-red-600">Delete</button>
            </form>
          </li>
        ))}
        {rules.length === 0 && <li className="px-3 py-2 text-gray-500">No recurring rules yet.</li>}
      </ul>
    </div>
  );
}
