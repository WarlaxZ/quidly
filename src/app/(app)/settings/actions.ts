"use server";
import { revalidatePath } from "next/cache";
import { getOrCreateDefaultProperty, updateProperty } from "../../../lib/data/property";
import { requireSession } from "../../../lib/auth/session";
export async function savePropertyAction(formData: FormData) {
  await requireSession();
  const property = await getOrCreateDefaultProperty();
  await updateProperty(property.id, {
    name: String(formData.get("name") ?? "").trim() || "My Property",
    address: String(formData.get("address") ?? "") || null,
  });
  revalidatePath("/settings");
  revalidatePath("/transactions");
}
