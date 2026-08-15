import { randomBytes } from "node:crypto";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { buildClevelandMarketIqReportSnapshot } from "@/lib/market-iq/report/build.server";
import { compareMarketIqEditions } from "@/lib/market-iq/report/edition-comparison";
import {
  applyMarketIqReportScope,
  buildMarketIqCoveragePreflight,
  defaultMarketIqScopeSelection,
} from "@/lib/market-iq/report/scope";
import { prisma } from "@/lib/prisma";

async function main() {
  if (process.env.MARKET_IQ_PUBLISH_CLEVELAND_BASELINE !== "1") return;
  if (process.env.VERCEL_ENV !== "preview") {
    throw new Error("Cleveland baseline publication is restricted to Vercel preview deployments.");
  }

  const organizations = await prisma.organization.findMany({
    where: {
      productAccess: { some: { productKey: "market_iq" } },
      OR: [
        { allMarkets: true },
        { marketAccess: { some: { marketId: CLEVELAND_MARKET_ID } } },
      ],
    },
    select: {
      id: true,
      name: true,
      brandProfile: true,
      _count: { select: { memberships: true } },
    },
  });
  const candidates = organizations.filter((organization) => organization._count.memberships > 0);
  if (candidates.length !== 1) {
    throw new Error(`Expected exactly one entitled Market IQ organization with members; found ${candidates.length}.`);
  }
  const organization = candidates[0];
  if (!organization.brandProfile) {
    throw new Error(`Organization ${organization.name} does not have a PM brand profile. No baseline was published.`);
  }

  const existing = await prisma.marketIqReport.findFirst({
    where: {
      organizationId: organization.id,
      marketId: CLEVELAND_MARKET_ID,
      status: "published",
    },
    orderBy: { publishedAt: "desc" },
    select: { id: true, publicToken: true, periodLabel: true },
  });
  if (existing) {
    console.log(JSON.stringify({ result: "existing", ...existing }));
    return;
  }

  const brand = {
    displayName: organization.brandProfile.displayName,
    logoUrl: organization.brandProfile.logoUrl,
    primaryColor: organization.brandProfile.primaryColor,
    accentColor: organization.brandProfile.accentColor,
    contactName: organization.brandProfile.contactName,
    contactEmail: organization.brandProfile.contactEmail,
    contactPhone: organization.brandProfile.contactPhone,
    websiteUrl: organization.brandProfile.websiteUrl,
  };
  const now = new Date();
  const snapshot = applyMarketIqReportScope(
    await buildClevelandMarketIqReportSnapshot({ generatedAt: now, brand }),
    defaultMarketIqScopeSelection(),
  );
  const coverage = buildMarketIqCoveragePreflight(snapshot);
  if (!coverage.canPublish) {
    throw new Error("No selected Cleveland Trends IQ cell clears the sample and freshness thresholds. No baseline was published.");
  }

  const frozenSnapshot = {
    ...snapshot,
    generatedAt: now.toISOString(),
    brand,
    editionComparison: compareMarketIqEditions(snapshot, null),
    editorial: {
      headline: null,
      introduction: null,
      reviewedAt: now.toISOString(),
      reviewedBy: "PM reviewer",
    },
  };
  const report = await prisma.marketIqReport.create({
    data: {
      organizationId: organization.id,
      marketId: CLEVELAND_MARKET_ID,
      periodLabel: `${snapshot.scope.periodStart} to ${snapshot.scope.periodEnd}`,
      publicToken: randomBytes(24).toString("base64url"),
      status: "published",
      scope: JSON.stringify(snapshot.scope),
      snapshot: JSON.stringify(frozenSnapshot),
      subjectAddress: null,
      brandProfileId: organization.brandProfile.id,
      generatedBy: "market-iq-baseline",
      publishedAt: now,
    },
    select: { id: true, publicToken: true, periodLabel: true },
  });
  console.log(JSON.stringify({
    result: "published",
    organization: organization.name,
    reportableCells: coverage.counts.reportable,
    ...report,
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
