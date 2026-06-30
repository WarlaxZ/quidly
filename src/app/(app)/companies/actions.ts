"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { createCompany, updateCompany, deleteCompanyIfEmpty } from "../../../lib/data/company";

function dayMonth(formData: FormData): { day: number; month: number } {
  return { day: Number(formData.get("accountingYearEndDay")), month: Number(formData.get("accountingYearEndMonth")) };
}

export async function addCompanyAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/companies?error=Name+required");
  const { day, month } = dayMonth(formData);
  if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(month) || month < 1 || month > 12) {
    redirect("/companies?error=" + encodeURIComponent("Enter a valid year-end day (1–31) and month."));
  }
  await createCompany({ name, accountingYearEndDay: day, accountingYearEndMonth: month });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function updateCompanyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  const { day, month } = dayMonth(formData);
  if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(month) || month < 1 || month > 12) {
    redirect("/companies?error=" + encodeURIComponent("Enter a valid year-end day (1–31) and month."));
  }
  await updateCompany(id, { name: String(formData.get("name") ?? "").trim() || "Unnamed", accountingYearEndDay: day, accountingYearEndMonth: month });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function deleteCompanyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  try {
    await deleteCompanyIfEmpty(id);
  } catch (e) {
    redirect(`/companies?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/companies");
  redirect("/companies");
}
