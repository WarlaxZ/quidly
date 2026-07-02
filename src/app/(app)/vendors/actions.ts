"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createVendor, deleteVendor } from "../../../lib/data/vendors";
import { requireSession } from "../../../lib/auth/session";

export async function createVendorAction(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
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
      email: String(input.email ?? "").trim() || null,
      phone: String(input.phone ?? "").trim() || null,
      address: String(input.address ?? "").trim() || null,
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
