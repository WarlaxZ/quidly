"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateProfile } from "../../../lib/data/taxProfile";
import { parseAmountToPence } from "../../../lib/money/parseAmount";

export async function saveOtherIncomeAction(formData: FormData) {
  const taxYear = String(formData.get("taxYear"));
  if (!/^\d{4}-\d{2}$/.test(taxYear)) {
    redirect(`/dashboard?error=${encodeURIComponent("Invalid tax year")}`);
  }
  const usePropertyAllowance = formData.get("usePropertyAllowance") === "on";
  const raw = String(formData.get("otherIncome") ?? "0").trim();
  let otherIncomePence!: number;
  try {
    otherIncomePence = raw === "" ? 0 : parseAmountToPence(raw);
  } catch (e) {
    redirect(`/dashboard?ty=${taxYear}&error=${encodeURIComponent((e as Error).message)}`);
  }
  await updateProfile(taxYear, { otherIncomePence, usePropertyAllowance });
  revalidatePath("/dashboard");
  redirect(`/dashboard?ty=${taxYear}`);
}
