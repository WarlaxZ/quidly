"use server";
import { revalidatePath } from "next/cache";
import { getOrCreateDefaultProperty, updateProperty } from "../../../lib/data/property";
export async function savePropertyAction(formData: FormData) {
  const property = await getOrCreateDefaultProperty();
  await updateProperty(property.id, {
    name: String(formData.get("name") ?? "").trim() || "My Property",
    address: String(formData.get("address") ?? "") || null,
  });
  revalidatePath("/settings");
  revalidatePath("/transactions");
}
