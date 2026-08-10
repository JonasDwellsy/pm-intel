import "server-only";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { buildSubjectPerformance, propertyDecisionRead } from "@/lib/portfolio-iq/property";
import { prisma } from "@/lib/prisma";
import { loadPortfolioDecisionHistory, loadPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";

export async function loadPortfolioIqProperty(input: {
  organizationId: string;
  userId: string;
  slug: string;
}) {
  const portfolio = await loadPortfolioIqHome(input);
  const asset = portfolio?.assets.find((candidate) => candidate.slug === input.slug);
  if (!portfolio || !asset) return null;

  const genericCommunityWords = new Set(["apartments", "apartment", "villas", "villa", "the", "road"]);
  const communityToken = asset.name
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 4 && !genericCommunityWords.has(word.toLowerCase()))
    .sort((left, right) => right.length - left.length)[0];

  const [dataImport, compSet, alerts, portfolioSignals, decisionHistory] = await Promise.all([
    prisma.marketIqDataImport.findFirst({
      where: { marketId: portfolio.marketId, sourceKind: "historical_export", status: "complete" },
      orderBy: { importedAt: "desc" },
      select: { id: true, availableThrough: true, sourceName: true, recordCount: true },
    }),
    prisma.portfolioIqCompSet.findUnique({
      where: { assetId: asset.id },
      include: {
        members: {
          where: { reviewStatus: { not: "excluded" } },
          orderBy: [{ selectionReason: "asc" }, { propertyLabel: "asc" }],
        },
      },
    }),
    prisma.marketIqAlert.findMany({
      where: {
        marketId: portfolio.marketId,
        propertyType: asset.assetType === "single_family" ? "house" : "apartment",
        OR: [
          { geographyType: "msa" },
          { geographyType: "city", geographyValue: { in: [asset.city, `${asset.city}, OH`] } },
          { geographyType: "zip", geographyValue: asset.postalCode },
        ],
      },
      orderBy: [{ observedMonth: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
    loadPortfolioWatchSignals(portfolio.id),
    loadPortfolioDecisionHistory(portfolio.id, asset.id),
  ]);

  const subjectListings = dataImport
    ? await prisma.marketIqListing.findMany({
        where: {
          importId: dataImport.id,
          OR: [
            ...asset.buildings.flatMap((building) => [
              { address: { startsWith: building.canonicalAddress, mode: "insensitive" as const } },
              { address: { startsWith: building.suppliedAddress, mode: "insensitive" as const } },
            ]),
            ...(communityToken
              ? [{ communityName: { contains: communityToken, mode: "insensitive" as const } }]
              : []),
          ],
        },
        select: {
          askingRent: true,
          squareFeet: true,
          bedrooms: true,
          activatedAt: true,
          deactivatedAt: true,
        },
      })
    : [];

  // The Cleveland source was downloaded on August 7 but is declared complete
  // only through July 31. Keep the analytical cutoff distinct from file date.
  const declaredClevelandCutoff = new Date("2026-07-31T23:59:59.999Z");
  const availableThrough = dataImport?.availableThrough
    ? new Date(Math.min(dataImport.availableThrough.getTime(), declaredClevelandCutoff.getTime()))
    : declaredClevelandCutoff;
  const members = compSet?.members ?? [];
  const performance = buildSubjectPerformance({
    observations: subjectListings,
    availableThrough,
    compAskingRents: members.flatMap((member) => member.askingRent ? [member.askingRent] : []),
    compRentPerSqFt: members.flatMap((member) =>
      member.askingRent && member.squareFeet && member.squareFeet > 0
        ? [member.askingRent / member.squareFeet]
        : []
    ),
  });

  return {
    portfolio,
    asset,
    dataImport,
    availableThrough,
    compSet,
    alerts,
    performance,
    signals: portfolioSignals.filter((signal) => signal.assetId === asset.id),
    decisionHistory,
    decisionRead: propertyDecisionRead({
      propertyName: asset.name,
      observationCount: performance.observationCount,
      askingRentVsComps: compSet?.status === "locked" ? performance.askingRentVsComps : null,
      askingRentChange90d: performance.askingRentChange90d,
      alertHeadline: alerts[0]?.headline,
    }),
  };
}
