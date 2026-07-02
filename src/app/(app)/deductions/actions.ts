"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth/session";
import { prisma } from "../../../lib/db";
import { addDismissal, removeDismissal } from "../../../lib/data/deductions";
import { createTransaction } from "../../../lib/data/transactions";
import { parseAmountToPence } from "../../../lib/money/parseAmount";
import { DEDUCTION_CATALOG } from "../../../lib/deductions/catalog";

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
  const back = (msg: string, ok = false) =>
    redirect(`/deductions?ty=${encodeURIComponent(taxYear)}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}`);

  const item = DEDUCTION_CATALOG.find((i) => i.key === String(formData.get("itemKey") ?? ""));
  if (!item) back("Unknown deduction item.");
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) back("Choose a property.");

  let amountPence!: number;
  try {
    amountPence = parseAmountToPence(String(formData.get("amount") ?? ""));
  } catch (e) {
    back((e as Error).message);
  }

  const category = await prisma.category.findUnique({ where: { name: item!.categoryName } });
  if (!category) back(`Category "${item!.categoryName}" not found — run the seed.`);

  await createTransaction({
    propertyId,
    categoryId: category!.id,
    date: new Date(String(formData.get("date"))),
    amountPence,
    direction: "out",
    vendorId: null,
    description: String(formData.get("description") ?? "") || item!.title,
  });
  revalidatePath("/deductions");
  revalidatePath("/transactions");
  back(`Logged ${item!.title}`, true);
}
