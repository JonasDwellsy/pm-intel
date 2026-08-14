"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { buildClevelandComposerPreview, type MarketIqReportBrandInput } from "@/lib/market-iq/report/composer.server";
import { canAccessMarketIqReportComposer } from "@/lib/market-iq/report/access";
import { prisma } from "@/lib/prisma";

function clipped(value: FormDataEntryValue | null, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function optionalUrl(value: FormDataEntryValue | null) {
  const raw = clipped(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function color(value: FormDataEntryValue | null, fallback: string) {
  const raw = clipped(value, 7);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : fallback;
}

async function authorizedMarketIqContext() {
  const previewEnabled = marketIqPreviewEnabled();
  if (!previewEnabled) return null;
  const [{ userId, organizationId }, hasProduct, entitlement] = await Promise.all([
    getActiveOrgContext(),
    viewerHasProductAccess("market_iq"),
    resolveViewerEntitlement(),
  ]);
  const allowed = canAccessMarketIqReportComposer({
    previewEnabled,
    userId,
    organizationId,
    hasProduct,
    marketEntitled: isMarketEntitled(entitlement, CLEVELAND_MARKET_ID),
  });
  if (!allowed || !userId || !organizationId) return null;
  return { userId, organizationId };
}

export async function publishMarketIqReport(formData: FormData): Promise<void> {
  const context = await authorizedMarketIqContext();
  if (!context) throw new Error("Market IQ report access is unavailable.");
  const displayName = clipped(formData.get("displayName"), 120);
  if (displayName.length < 2) throw new Error("Enter the PM brand name shown to the client.");
  const contactEmail = clipped(formData.get("contactEmail"), 254) || null;
  if (contactEmail && (!contactEmail.includes("@") || contactEmail.includes(" "))) throw new Error("Enter a valid contact email.");
  const logoRaw = clipped(formData.get("logoUrl"), 500);
  const websiteRaw = clipped(formData.get("websiteUrl"), 500);
  const brand: MarketIqReportBrandInput = {
    displayName,
    logoUrl: optionalUrl(formData.get("logoUrl")),
    primaryColor: color(formData.get("primaryColor"), "#173B57"),
    accentColor: color(formData.get("accentColor"), "#B96D3A"),
    contactName: clipped(formData.get("contactName"), 120) || null,
    contactEmail,
    contactPhone: clipped(formData.get("contactPhone"), 40) || null,
    websiteUrl: optionalUrl(formData.get("websiteUrl")),
  };
  if (logoRaw && !brand.logoUrl) throw new Error("Logo URL must be a valid HTTPS address.");
  if (websiteRaw && !brand.websiteUrl) throw new Error("Website URL must be a valid HTTPS address.");

  const now = new Date();
  const { snapshot } = await buildClevelandComposerPreview(brand);
  const publicToken = randomBytes(24).toString("base64url");
  const report = await prisma.$transaction(async (tx) => {
    const brandProfile = await tx.organizationBrandProfile.upsert({
      where: { organizationId: context.organizationId },
      create: { organizationId: context.organizationId, ...brand },
      update: brand,
    });
    return tx.marketIqReport.create({
      data: {
        organizationId: context.organizationId,
        marketId: CLEVELAND_MARKET_ID,
        periodLabel: `${snapshot.scope.periodStart} to ${snapshot.scope.periodEnd}`,
        publicToken,
        status: "published",
        scope: JSON.stringify(snapshot.scope),
        snapshot: JSON.stringify({ ...snapshot, generatedAt: now.toISOString(), brand }),
        subjectAddress: null,
        brandProfileId: brandProfile.id,
        generatedBy: context.userId,
        publishedAt: now,
      },
      select: { id: true },
    });
  });
  revalidatePath("/market-iq/report");
  redirect(`/market-iq/report?published=${report.id}`);
}

export async function revokeMarketIqReport(formData: FormData): Promise<void> {
  const context = await authorizedMarketIqContext();
  const reportId = clipped(formData.get("reportId"), 80);
  if (!context || !reportId) throw new Error("Market IQ report update is unavailable.");
  const report = await prisma.marketIqReport.findFirst({
    where: { id: reportId, organizationId: context.organizationId },
    select: { id: true, status: true },
  });
  if (!report) throw new Error("Report not found.");
  if (report.status === "published") {
    await prisma.marketIqReport.update({ where: { id: report.id }, data: { status: "revoked" } });
  }
  revalidatePath("/market-iq/report");
}
