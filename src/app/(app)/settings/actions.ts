"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { updateProperty } from "../../../lib/data/property";
import { requireSession } from "../../../lib/auth/session";
export async function savePropertyAction(formData: FormData) {
  await requireSession();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) return;
  await updateProperty(propertyId, {
    name: String(formData.get("name") ?? "").trim() || "My Property",
    address: String(formData.get("address") ?? "") || null,
  });
  revalidatePath("/settings");
  revalidatePath("/transactions");
  redirect("/settings?ok=Saved");
}
