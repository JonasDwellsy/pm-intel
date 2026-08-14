import "server-only";

import { prisma } from "@/lib/prisma";
import { buildClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import {
  seededClevelandMarketReport,
} from "@/lib/market-iq/report/seeded-cleveland";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

export type MarketIqReportBrandInput = MarketIqReportSnapshot["brand"];

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
  source: "analytical_store" | "verified_seed";
}> {
  try {
    return {
      snapshot: await buildClevelandMarketIqReportSnapshot({ brand }),
      source: "analytical_store",
    };
  } catch (error) {
    if (process.env.MARKET_IQ_PREVIEW_ENABLED !== "1") throw error;
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
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      brandProfile: true,
      marketIqReports: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          periodLabel: true,
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
  });
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
  return { organization, brand, preview };
}
