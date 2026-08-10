import "server-only";
import { prisma } from "@/lib/prisma";
import { buildSubjectPerformance } from "@/lib/portfolio-iq/property";
import { buildPortfolioWatchDrafts } from "@/lib/portfolio-iq/watch";
import { isPortfolioSignalActionable } from "@/lib/portfolio-iq/decision";
import { buildBedroomSegments } from "@/lib/portfolio-iq/segments";
import { syncDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";

function communityToken(name: string): string | undefined {
  const generic = new Set(["apartments", "apartment", "villas", "villa", "the", "road"]);
  return name.split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 4 && !generic.has(word.toLowerCase()))
    .sort((left, right) => right.length - left.length)[0];
}

export async function refreshPortfolioWatchSignals(portfolioId: string) {
  const portfolio = await prisma.portfolioIqPortfolio.findUnique({
    where: { id: portfolioId },
    include: {
      assets: {
        include: {
          buildings: true,
          compSet: { include: { members: { where: { reviewStatus: { not: "excluded" } } }, segments: true } },
        },
      },
    },
  });
  if (!portfolio) throw new Error("Portfolio not found.");
  const [dataImport, alerts] = await Promise.all([
    prisma.marketIqDataImport.findFirst({
      where: { marketId: portfolio.marketId, sourceKind: "historical_export", status: "complete" },
      orderBy: { importedAt: "desc" },
      select: { id: true, availableThrough: true },
    }),
    prisma.marketIqAlert.findMany({
      where: { marketId: portfolio.marketId },
      orderBy: [{ observedMonth: "desc" }, { severity: "asc" }],
      take: 300,
    }),
  ]);
  const declaredCutoff = new Date("2026-07-31T23:59:59.999Z");
  const observedAt = dataImport?.availableThrough
    ? new Date(Math.min(dataImport.availableThrough.getTime(), declaredCutoff.getTime()))
    : declaredCutoff;

  const drafts = (await Promise.all(portfolio.assets.map(async (asset) => {
    const token = communityToken(asset.name);
    const observations = dataImport
      ? await prisma.marketIqListing.findMany({
          where: {
            importId: dataImport.id,
            OR: [
              ...asset.buildings.flatMap((building) => [
                { address: { startsWith: building.canonicalAddress, mode: "insensitive" as const } },
                { address: { startsWith: building.suppliedAddress, mode: "insensitive" as const } },
              ]),
              ...(token ? [{ communityName: { contains: token, mode: "insensitive" as const } }] : []),
            ],
          },
          select: { askingRent: true, squareFeet: true, bedrooms: true, activatedAt: true, deactivatedAt: true },
        })
      : [];
    const members = asset.compSet?.members ?? [];
    const performance = buildSubjectPerformance({
      observations,
      availableThrough: observedAt,
      compAskingRents: members.flatMap((member) => member.askingRent ? [member.askingRent] : []),
      compRentPerSqFt: members.flatMap((member) => member.askingRent && member.squareFeet ? [member.askingRent / member.squareFeet] : []),
    });
    const bedroomSegments = buildBedroomSegments({ observations, availableThrough: observedAt, compMembers: members, reviews: asset.compSet?.segments ?? [] });
    const propertyType = asset.assetType === "single_family" ? "house" : "apartment";
    const relevantAlerts = alerts.filter((alert) =>
      alert.propertyType === propertyType && observations.some((row) => row.bedrooms === alert.bedrooms) && (
        alert.geographyType === "msa" ||
        (alert.geographyType === "zip" && alert.geographyValue === asset.postalCode) ||
        (alert.geographyType === "city" && [asset.city, `${asset.city}, OH`].includes(alert.geographyValue))
      )
    );
    const bestAlert = relevantAlerts.sort((left, right) => {
      const geography = (value: string) => value === "zip" ? 3 : value === "city" ? 2 : 1;
      return Number(right.severity === "material") - Number(left.severity === "material") ||
        geography(right.geographyType) - geography(left.geographyType) ||
        right.observedMonth.getTime() - left.observedMonth.getTime();
    })[0];
    return buildPortfolioWatchDrafts({
      portfolioId: portfolio.id,
      assetId: asset.id,
      assetSlug: asset.slug,
      assetName: asset.name,
      matchStatus: asset.matchStatus,
      uruStatus: asset.uruStatus,
      compStatus: asset.compSet?.status ?? null,
      observationCount: performance.observationCount,
      askingRentVsComps: performance.askingRentVsComps,
      rentPerSqFtVsComps: performance.rentPerSqFtVsComps,
      askingRentChange90d: performance.askingRentChange90d,
      medianDom: performance.medianDom,
      segments: bedroomSegments.map((segment) => ({
        bedrooms: segment.bedrooms, label: segment.label, isLocked: segment.isLocked,
        observationCount: segment.performance.observationCount,
        askingRentVsComps: segment.performance.askingRentVsComps,
        rentPerSqFtVsComps: segment.performance.rentPerSqFtVsComps,
        askingRentChange90d: segment.performance.askingRentChange90d,
        medianDom: segment.performance.medianDom,
      })),
      marketAlert: bestAlert ? {
        id: bestAlert.id,
        severity: bestAlert.severity,
        headline: bestAlert.headline,
        narrative: bestAlert.narrative,
        observedAt: bestAlert.observedMonth,
      } : null,
      observedAt,
    });
  }))).flat();

  const now = new Date();
  const priorSignals = drafts.length
    ? await prisma.portfolioIqSignal.findMany({
        where: { fingerprint: { in: drafts.map((signal) => signal.fingerprint) } },
        select: { fingerprint: true, status: true },
      })
    : [];
  const priorStatus = new Map(priorSignals.map((signal) => [signal.fingerprint, signal.status]));
  await prisma.$transaction(async (tx) => {
    for (const signal of drafts) {
      await tx.portfolioIqSignal.upsert({
        where: { fingerprint: signal.fingerprint },
        create: { ...signal, status: "active", firstSeenAt: now, lastSeenAt: now },
        update: {
          signalType: signal.signalType,
          category: signal.category,
          severity: signal.severity,
          confidence: signal.confidence,
          rankScore: signal.rankScore,
          headline: signal.headline,
          narrative: signal.narrative,
          ownerQuestion: signal.ownerQuestion,
          evidence: signal.evidence,
          observedAt: signal.observedAt,
          status: "active",
          ...(priorStatus.get(signal.fingerprint) === "resolved" ? { firstSeenAt: now } : {}),
          lastSeenAt: now,
          resolvedAt: null,
        },
      });
    }
    const fingerprints = drafts.map((signal) => signal.fingerprint);
    await tx.portfolioIqSignal.updateMany({
      where: { portfolioId, status: "active", ...(fingerprints.length ? { fingerprint: { notIn: fingerprints } } : {}) },
      data: { status: "resolved", resolvedAt: now },
    });
  });
  await syncDwellsyIqInsights(portfolioId);
  return loadPortfolioWatchSignals(portfolioId);
}

export async function loadPortfolioWatchSignals(portfolioId: string) {
  const signals = await prisma.portfolioIqSignal.findMany({
    where: { portfolioId, status: "active" },
    include: {
      asset: { select: { slug: true, name: true, city: true, postalCode: true } },
      decision: { include: { events: { orderBy: { createdAt: "desc" }, take: 5 } } },
    },
    orderBy: [{ rankScore: "desc" }, { observedAt: "desc" }],
  });
  const now = new Date();
  return signals.filter((signal) => isPortfolioSignalActionable(signal.decision, now));
}

export async function loadPortfolioDecisionHistory(portfolioId: string, assetId?: string) {
  return prisma.portfolioIqSignalDecisionEvent.findMany({
    where: { decision: { signal: { portfolioId, ...(assetId ? { assetId } : {}) } } },
    include: {
      decision: {
        include: { signal: { select: { id: true, headline: true, asset: { select: { name: true, slug: true } } } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
}
