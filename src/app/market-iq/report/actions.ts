"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { buildClevelandComposerPreview, type MarketIqReportBrandInput } from "@/lib/market-iq/report/composer.server";
import { canAccessMarketIqReportComposer } from "@/lib/market-iq/report/access";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { compareMarketIqEditions } from "@/lib/market-iq/report/edition-comparison";
import {
  applyMarketIqReportScope,
  buildMarketIqCoveragePreflight,
  parseMarketIqScopeFormData,
} from "@/lib/market-iq/report/scope";
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
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  const allowed = canAccessMarketIqReportComposer({
    previewEnabled,
    userId,
    organizationId,
    hasProduct: access.hasProduct,
    marketEntitled: isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID),
  });
  if (!allowed || !userId || !organizationId) return null;
  return { userId, organizationId };
}

export async function publishMarketIqReport(formData: FormData): Promise<void> {
  const context = await authorizedMarketIqContext();
  if (!context) throw new Error("Market IQ report access is unavailable.");
  if (clipped(formData.get("marketId"), 80) !== CLEVELAND_MARKET_ID) throw new Error("The selected market is not available.");
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
  const selection = parseMarketIqScopeFormData(formData);
  if (!selection.cities.length && !selection.zipCodes.length) throw new Error("Select at least one city or ZIP code.");
  if (!selection.segments.length) throw new Error("Select at least one product segment.");
  const preview = await buildClevelandComposerPreview(brand);
  const snapshot = applyMarketIqReportScope(preview.snapshot, selection);
  const coverage = buildMarketIqCoveragePreflight(snapshot);
  if (!coverage.canPublish) throw new Error("At least one selected geography and segment must have a fresh Trends IQ value before publishing.");
  const priorReport = await prisma.marketIqReport.findFirst({
    where: { organizationId: context.organizationId, marketId: CLEVELAND_MARKET_ID, status: "published" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, periodLabel: true, publishedAt: true, snapshot: true },
  });
  const priorSnapshot = priorReport ? parseMarketIqReportSnapshot(priorReport.snapshot) : null;
  const priorEdition = priorReport && priorSnapshot ? {
    id: priorReport.id,
    periodLabel: priorReport.periodLabel,
    publishedAt: priorReport.publishedAt?.toISOString() ?? null,
    snapshot: applyMarketIqReportScope(priorSnapshot, selection),
  } : null;
  const frozenSnapshot = {
    ...snapshot,
    generatedAt: now.toISOString(),
    brand,
    editionComparison: compareMarketIqEditions(snapshot, priorEdition),
    editorial: {
      headline: clipped(formData.get("editorialHeadline"), 120) || null,
      introduction: clipped(formData.get("editorialIntroduction"), 700) || null,
      reviewedAt: now.toISOString(),
      reviewedBy: "PM reviewer",
    },
  };
  const publicToken = randomBytes(24).toString("base64url");
  const report = await prisma.$transaction(async (tx) => {
    const brandProfile = await tx.organizationBrandProfile.upsert({
      where: { organizationId: context.organizationId },
      create: { organizationId: context.organizationId, ...brand },
      update: brand,
    });
    const createdReport = await tx.marketIqReport.create({
      data: {
        organizationId: context.organizationId,
        marketId: CLEVELAND_MARKET_ID,
        periodLabel: `${snapshot.scope.periodStart} to ${snapshot.scope.periodEnd}`,
        publicToken,
        status: "published",
        scope: JSON.stringify(snapshot.scope),
        snapshot: JSON.stringify(frozenSnapshot),
        subjectAddress: null,
        brandProfileId: brandProfile.id,
        generatedBy: context.userId,
        publishedAt: now,
      },
      select: { id: true },
    });
    const campaign = await tx.marketIqDistributionCampaign.create({
      data: {
        organizationId: context.organizationId,
        reportId: createdReport.id,
        createdByUserId: context.userId,
      },
      select: { id: true },
    });
    if (priorReport) {
      const priorAudience = await tx.marketIqReportSend.findMany({
        where: {
          organizationId: context.organizationId,
          reportId: priorReport.id,
          OR: [{ deliveryStatus: "sent" }, { deliveredAt: { not: null } }],
        },
        distinct: ["recipientId"],
        select: { recipientId: true },
      });
      if (priorAudience.length) {
        await tx.marketIqDistributionCampaignRecipient.createMany({
          data: priorAudience.map(({ recipientId }) => ({
            organizationId: context.organizationId,
            campaignId: campaign.id,
            reportId: createdReport.id,
            recipientId,
          })),
          skipDuplicates: true,
        });
      }
    }
    return { id: createdReport.id, campaignId: campaign.id };
  });
  revalidatePath("/market-iq/report");
  redirect(`/market-iq/distribution/${report.campaignId}`);
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
