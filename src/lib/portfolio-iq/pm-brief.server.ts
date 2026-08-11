import "server-only";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { buildPortfolioIqPmBriefSnapshot, parsePortfolioIqPmBriefSnapshot } from "@/lib/portfolio-iq/pm-brief";

export async function loadPortfolioIqPmBriefComposer(input: { organizationId: string; userId: string; slug: string; signalId?: string | null }) {
  const property = await loadPortfolioIqProperty(input);
  if (!property) return null;
  const signal = input.signalId
    ? property.signals.find((candidate) => candidate.id === input.signalId) ?? null
    : property.signals[0] ?? null;
  const briefs = await prisma.portfolioIqPmBrief.findMany({
    where: { assetId: property.asset.id },
    include: { response: true, signal: { select: { headline: true } } },
    orderBy: { publishedAt: "desc" },
    take: 12,
  });
  return { property, signal, briefs };
}

export function buildPmBriefSnapshotFromComposer(input: {
  composer: NonNullable<Awaited<ReturnType<typeof loadPortfolioIqPmBriefComposer>>>;
  publishedAt: Date;
  ownerNote: string | null;
  responseDueAt: Date | null;
}) {
  if (!input.composer.signal) return null;
  const { property, signal } = input.composer;
  const marketAlert = property.alerts[0] ?? null;
  return buildPortfolioIqPmBriefSnapshot({
    publishedAt: input.publishedAt,
    property: property.asset,
    signal,
    performance: property.performance,
    availableThrough: property.availableThrough ?? null,
    compStatus: property.compSet?.status ?? null,
    compCount: property.compSet?.members.length ?? 0,
    marketContext: marketAlert ? { headline: marketAlert.headline, narrative: marketAlert.narrative } : null,
    ownerNote: input.ownerNote,
    responseDueAt: input.responseDueAt,
  });
}

export async function loadPublicPortfolioIqPmBrief(publicToken: string) {
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(publicToken)) return null;
  const brief = await prisma.portfolioIqPmBrief.findUnique({ where: { publicToken }, include: { response: true } });
  if (!brief || brief.status === "revoked") return null;
  const snapshot = parsePortfolioIqPmBriefSnapshot(brief.snapshot);
  return snapshot ? { brief, snapshot } : null;
}
