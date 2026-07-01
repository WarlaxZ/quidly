"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createVendor, deleteVendor } from "../../../lib/data/vendors";
import { requireSession } from "../../../lib/auth/session";

export async function addVendorAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await createVendor({
    name,
    contactDetails: String(formData.get("contactDetails") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });
  revalidatePath("/vendors");
  redirect("/vendors?ok=Vendor+added");
}

export async function deleteVendorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteVendor(id);
  revalidatePath("/vendors");
  redirect("/vendors?ok=Vendor+deleted");
}
