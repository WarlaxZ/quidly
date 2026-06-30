import "server-only";
import { cookies } from "next/headers";
import { prisma } from "../db";

export const ACTIVE_PROPERTY_COOKIE = "active_property";

export interface ResolvedActiveProperty {
  propertyId: string | null;
  isAll: boolean;
}

export function resolveActiveProperty(properties: { id: string }[], cookieValue: string | undefined): ResolvedActiveProperty {
  if (cookieValue === "all") return { propertyId: null, isAll: true };
  if (cookieValue && properties.some((p) => p.id === cookieValue)) {
    return { propertyId: cookieValue, isAll: false };
  }
  return { propertyId: properties[0]?.id ?? null, isAll: false };
}

export function listProperties() {
  return prisma.property.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getActiveProperty(): Promise<ResolvedActiveProperty> {
  const cookieValue = (await cookies()).get(ACTIVE_PROPERTY_COOKIE)?.value;
  const properties = await listProperties();
  return resolveActiveProperty(properties, cookieValue);
}
