import "server-only";

import { prisma } from "@/lib/prisma";
import { loadCachedClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import {
  seededClevelandMarketReport,
} from "@/lib/market-iq/report/seeded-cleveland";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import { parseMarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import type { PriorMarketIqEdition } from "@/lib/market-iq/report/edition-comparison";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";

export type MarketIqReportBrandInput = MarketIqReportSnapshot["brand"];
export type MarketIqEditorialDefaults = {
  defaultClientMessage: string | null;
  defaultProspectMessage: string | null;
  companyProfile: string | null;
  companyCtaLabel: string | null;
  companyCtaUrl: string | null;
};

export const EMPTY_MARKET_IQ_EDITORIAL_DEFAULTS: MarketIqEditorialDefaults = {
  defaultClientMessage: null,
  defaultProspectMessage: null,
  companyProfile: null,
  companyCtaLabel: null,
  companyCtaUrl: null,
};

export function defaultMarketIqReportBrand(organizationName: string): MarketIqReportBrandInput {
  return {
    displayName: organizationName,
    logoUrl: null,
    primaryColor: "#173B57",
    accentColor: "#B96D3A",
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    websiteUrl: null,
  };
}

export async function buildClevelandComposerPreview(brand: MarketIqReportBrandInput): Promise<{
  snapshot: MarketIqReportSnapshot;
  source: "dwellsy_trends" | "verified_seed";
}> {
  try {
    const snapshot = await loadCachedClevelandMarketIqReportSnapshot();
    return {
      snapshot: { ...snapshot, brand },
      source: "dwellsy_trends",
    };
  } catch (error) {
    if (process.env.MARKET_IQ_PREVIEW_ENABLED !== "1" && process.env.VERCEL_ENV !== "preview") throw error;
    return {
      snapshot: {
        ...seededClevelandMarketReport,
        generatedAt: new Date().toISOString(),
        brand,
      },
      source: "verified_seed",
    };
  }
}

export async function loadMarketIqReportComposer(organizationId: string) {
  const [organization, latestPublished] = await Promise.all([prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      brandProfile: true,
      marketIqWorkspacePreference: true,
      marketIqReports: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          periodLabel: true,
          scope: true,
          publicToken: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          sends: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              deliveryStatus: true,
              sentAt: true,
              deliveredAt: true,
              deliveryError: true,
              lastEmailEventAt: true,
              lastEmailEventType: true,
              recipient: { select: { name: true, email: true, kind: true } },
            },
          },
        },
      },
    },
  }), prisma.marketIqReport.findFirst({
    where: { organizationId, status: "published" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, periodLabel: true, publishedAt: true, snapshot: true },
  })]);
  if (!organization) return null;
  const brand = organization.brandProfile ?? defaultMarketIqReportBrand(organization.name);
  const preview = await buildClevelandComposerPreview({
    displayName: brand.displayName,
    logoUrl: brand.logoUrl,
    primaryColor: brand.primaryColor,
    accentColor: brand.accentColor,
    contactName: brand.contactName,
    contactEmail: brand.contactEmail,
    contactPhone: brand.contactPhone,
    websiteUrl: brand.websiteUrl,
  });
  const priorSnapshot = latestPublished ? parseMarketIqReportSnapshot(latestPublished.snapshot) : null;
  const priorEdition: PriorMarketIqEdition | null = latestPublished && priorSnapshot ? {
    id: latestPublished.id,
    periodLabel: latestPublished.periodLabel,
    publishedAt: latestPublished.publishedAt?.toISOString() ?? null,
    snapshot: priorSnapshot,
  } : null;
  const editorialDefaults: MarketIqEditorialDefaults = organization.brandProfile ? {
    defaultClientMessage: organization.brandProfile.defaultClientMessage,
    defaultProspectMessage: organization.brandProfile.defaultProspectMessage,
    companyProfile: organization.brandProfile.companyProfile,
    companyCtaLabel: organization.brandProfile.companyCtaLabel,
    companyCtaUrl: organization.brandProfile.companyCtaUrl,
  } : EMPTY_MARKET_IQ_EDITORIAL_DEFAULTS;
  return { organization, brand, preview, priorEdition, editorialDefaults, initialSelection: marketIqSelectionFromPreference(organization.marketIqWorkspacePreference) };
}
