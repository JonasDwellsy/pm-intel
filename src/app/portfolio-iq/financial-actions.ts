"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { prisma } from "@/lib/prisma";

function optionalPositiveInteger(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : null;
}

export async function savePortfolioIqFinancialAssumption(formData: FormData): Promise<void> {
  const { userId } = await auth();
  const { organizationId } = await getActiveOrgContext();
  const assetId = String(formData.get("assetId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const bedrooms = Number(String(formData.get("bedrooms") ?? "-1"));
  const inventoryUnits = optionalPositiveInteger(formData.get("inventoryUnits"));
  const affectedUnits = optionalPositiveInteger(formData.get("affectedUnits"));
  const realizationPercent = Number(String(formData.get("realizationPercent") ?? "50"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!userId || !organizationId || !assetId || !slug || !Number.isInteger(bedrooms) || bedrooms < -1 || bedrooms > 10) throw new Error("Financial assumption request is incomplete.");
  if (!Number.isFinite(realizationPercent) || realizationPercent < 0 || realizationPercent > 100) throw new Error("Realization must be between 0% and 100%.");
  if (affectedUnits !== null && inventoryUnits !== null && affectedUnits > inventoryUnits) throw new Error("Affected units cannot exceed inventory units.");
  const asset = await prisma.portfolioIqAsset.findUnique({ where: { id: assetId }, include: { portfolio: { select: { organizationId: true, isSynthetic: true } } } });
  if (!asset || asset.slug !== slug || (asset.portfolio.organizationId !== organizationId && !(asset.portfolio.isSynthetic && isAdminUser(userId)))) throw new Error("Property not found.");
  await prisma.portfolioIqFinancialAssumption.upsert({
    where: { assetId_bedrooms: { assetId, bedrooms } },
    create: { assetId, bedrooms, inventoryUnits, affectedUnits, realizationPct: realizationPercent / 100, note, updatedBy: userId },
    update: { inventoryUnits, affectedUnits, realizationPct: realizationPercent / 100, note, updatedBy: userId },
  });
  revalidatePath("/portfolio-iq/financial-impact");
  revalidatePath("/today");
  revalidatePath(`/portfolio-iq/properties/${slug}`);
  revalidatePath(`/portfolio-iq/properties/${slug}/financial-impact`);
}
