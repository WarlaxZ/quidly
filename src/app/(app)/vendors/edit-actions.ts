"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { updateVendor } from "../../../lib/data/vendors";

export async function updateVendorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await updateVendor(id, {
    name: String(formData.get("name") ?? "").trim() || "Unnamed",
    email: String(formData.get("email") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    address: String(formData.get("address") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });
  revalidatePath("/vendors");
  redirect("/vendors?ok=Vendor+updated");
}
