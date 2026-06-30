"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "../../lib/auth/session";
import { ACTIVE_PROPERTY_COOKIE } from "../../lib/data/activeProperty";

export async function setActivePropertyAction(formData: FormData) {
  await requireSession();
  const value = String(formData.get("propertyId") ?? "all");
  (await cookies()).set(ACTIVE_PROPERTY_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
