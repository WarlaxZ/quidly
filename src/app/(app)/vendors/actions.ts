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

export async function createVendorAction(input: {
  name: string;
  contactDetails?: string | null;
  notes?: string | null;
}): Promise<
  | { ok: true; vendor: { id: string; name: string } }
  | { ok: false; error: string }
> {
  await requireSession();
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required." };
  try {
    const vendor = await createVendor({
      name,
      contactDetails: String(input.contactDetails ?? "").trim() || null,
      notes: String(input.notes ?? "").trim() || null,
    });
    revalidatePath("/vendors");
    return { ok: true, vendor: { id: vendor.id, name: vendor.name } };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Couldn't create vendor." };
  }
}

export async function deleteVendorAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteVendor(id);
  revalidatePath("/vendors");
  redirect("/vendors?ok=Vendor+deleted");
}
