"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateProfile } from "../../../lib/data/taxProfile";
import { parseAmountToPence } from "../../../lib/money/parseAmount";

export async function saveOtherIncomeAction(formData: FormData) {
  const taxYear = String(formData.get("taxYear"));
  const raw = String(formData.get("otherIncome") ?? "0").trim();
  const otherIncomePence = raw === "" ? 0 : parseAmountToPence(raw);
  await updateProfile(taxYear, { otherIncomePence });
  revalidatePath("/dashboard");
  redirect(`/dashboard?ty=${taxYear}`);
}
