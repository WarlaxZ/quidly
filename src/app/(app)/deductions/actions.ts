"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/session";
import { prisma } from "../../../lib/db";
import { addDismissal, removeDismissal } from "../../../lib/data/deductions";
import { createTransaction } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import { DEDUCTION_CATALOG } from "../../../lib/deductions/catalog";
import { mileageClaimPence } from "../../../lib/tax/mileage";
import { cumulativeMilesForTaxYear } from "../../../lib/data/mileage";

export async function dismissDeductionAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const itemKey = String(formData.get("itemKey") ?? "");
  if (taxYear && itemKey) await addDismissal(taxYear, itemKey);
  revalidatePath("/deductions");
  redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&ok=${encodeURIComponent("Marked not applicable")}`);
}

export async function undismissDeductionAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const itemKey = String(formData.get("itemKey") ?? "");
  if (taxYear && itemKey) await removeDismissal(taxYear, itemKey);
  revalidatePath("/deductions");
  redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&ok=${encodeURIComponent("Restored")}`);
}

export async function logDeductionAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const back = (msg: string, ok = false): never =>
    redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);
  if (!/^\d{4}-\d{2}$/.test(taxYear)) return back("Invalid tax year.");

  const item = DEDUCTION_CATALOG.find((i) => i.key === String(formData.get("itemKey") ?? ""));
  if (!item) return back("Unknown deduction item.");

  const propertyId = String(formData.get("propertyId") ?? "");
  const property = propertyId
    ? await prisma.property.findFirst({ where: { id: propertyId, ownershipType: "personal" } })
    : null;
  if (!property) return back("Choose a valid property.");

  const rawDate = String(formData.get("date") ?? "");
  const date = new Date(rawDate);
  if (!rawDate || Number.isNaN(date.getTime())) return back("Enter a valid date.");

  let amountPence: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    return back((e as Error).message);
  }

  const category = await prisma.category.findUnique({ where: { name: item.categoryName } });
  if (!category) return back(`Category "${item.categoryName}" not found — run the seed.`);

  await createTransaction({
    propertyId: property.id,
    categoryId: category.id,
    date,
    amountPence: amountPence!,
    direction: "out",
    vendorId: null,
    description: String(formData.get("description") ?? "") || item.title,
  });
  revalidatePath("/deductions");
  revalidatePath("/transactions");
  back(`Logged ${item.title}`, true);
}

export async function logMileageAction(formData: FormData) {
  await requireSession();
  const taxYear = String(formData.get("taxYear") ?? "");
  const back = (msg: string, ok = false): never =>
    redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);
  if (!/^\d{4}-\d{2}$/.test(taxYear)) return back("Invalid tax year.");

  const propertyId = String(formData.get("propertyId") ?? "");
  const property = propertyId
    ? await prisma.property.findFirst({ where: { id: propertyId, ownershipType: "personal" } })
    : null;
  if (!property) return back("Choose a valid property.");

  const rawDate = String(formData.get("date") ?? "");
  const date = new Date(rawDate);
  if (!rawDate || Number.isNaN(date.getTime())) return back("Enter a valid date.");

  const miles = Math.round(Number(formData.get("miles")));
  if (!Number.isFinite(miles) || miles <= 0) return back("Enter the miles for the trip.");

  const purpose = String(formData.get("purpose") ?? "").trim() || "Trip to property";

  const item = DEDUCTION_CATALOG.find((i) => i.key === "mileage");
  if (!item) return back("Mileage item missing from catalog.");
  const category = await prisma.category.findUnique({ where: { name: item.categoryName } });
  if (!category) return back(`Category "${item.categoryName}" not found — run the seed.`);

  const before = await cumulativeMilesForTaxYear(taxYear);
  const amountPence = mileageClaimPence(miles, before, taxYear);
  if (amountPence <= 0) return back("Could not compute a claimable amount — check your trip details.");

  await createTransaction({
    propertyId: property.id,
    categoryId: category.id,
    date,
    amountPence,
    direction: "out",
    vendorId: null,
    description: `${purpose} — ${miles} miles`,
    miles,
  });

  // Saves the SUBMITTED miles as the property's round trip (the user may have edited the field).
  if (formData.get("remember") === "on") {
    await prisma.property.update({ where: { id: property.id }, data: { roundTripMiles: miles } });
  }

  revalidatePath("/deductions");
  revalidatePath("/transactions");
  back(`Logged ${miles} miles (£${(amountPence / 100).toFixed(2)})`, true);
}
