"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth/session";
import { createProperty, updateProperty, deletePropertyIfEmpty } from "../../../lib/data/property";

export async function addPropertyAction(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/properties?error=Name+required");
  const ownershipType = String(formData.get("ownershipType")) === "company" ? "company" : "personal";
  const companyId = ownershipType === "company" ? String(formData.get("companyId") || "") || null : null;
  await createProperty({
    name,
    address: String(formData.get("address") ?? "") || null,
    ownershipType,
    companyId,
  });
  revalidatePath("/properties");
  redirect("/properties");
}

export async function updatePropertyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  const ownershipType = String(formData.get("ownershipType")) === "company" ? "company" : "personal";
  const companyId = ownershipType === "company" ? String(formData.get("companyId") || "") || null : null;
  await updateProperty(id, {
    name: String(formData.get("name") ?? "").trim() || "Unnamed",
    address: String(formData.get("address") ?? "") || null,
    ownershipType,
    companyId,
  });
  revalidatePath("/properties");
  redirect("/properties");
}

export async function deletePropertyAction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  try {
    await deletePropertyIfEmpty(id);
  } catch (e) {
    redirect(`/properties?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/properties");
  redirect("/properties");
}
