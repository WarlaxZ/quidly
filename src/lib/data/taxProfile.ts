import "server-only";
import { prisma } from "../db";
import type { Region } from "../tax/types";

export function getOrCreateProfile(taxYear: string) {
  return prisma.taxYearProfile.upsert({ where: { taxYear }, update: {}, create: { taxYear } });
}
export interface ProfileInput {
  otherIncomePence?: number;
  region?: Region;
  usePropertyAllowance?: boolean;
}
export async function updateProfile(taxYear: string, input: ProfileInput) {
  await prisma.taxYearProfile.upsert({ where: { taxYear }, update: input, create: { taxYear, ...input } });
}
