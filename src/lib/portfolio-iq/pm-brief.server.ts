import "server-only";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { buildPortfolioIqPmBriefSnapshot, parsePortfolioIqPmBriefSnapshot } from "@/lib/portfolio-iq/pm-brief";

export async function loadPortfolioIqPmBriefComposer(input: { organizationId: string; userId: string; slug: string; signalId?: string | null }) {
  const property = await loadPortfolioIqProperty(input);
  if (!property) return null;
  let signal = input.signalId
    ? property.signals.find((candidate) => candidate.id === input.signalId) ?? null
    : property.signals[0] ?? null;
  if (input.signalId && !signal) {
    const requestedSignal = await prisma.portfolioIqSignal.findFirst({
      where: {
        id: input.signalId,
        portfolioId: property.portfolio.id,
        status: "active",
      },
      include: {
        asset: { select: { slug: true, name: true, city: true, postalCode: true } },
        decision: { include: { events: { orderBy: { createdAt: "desc" }, take: 5 } } },
        unifiedInsight: { select: { sourceAlertId: true } },
      },
    });
    const sourceAlertId = requestedSignal?.unifiedInsight?.sourceAlertId ?? null;
    const [exposure, alert] = sourceAlertId ? await Promise.all([
      prisma.dwellsyIqInsightExposure.findFirst({
        where: { assetId: property.asset.id, insight: { portfolioId: property.portfolio.id, sourceAlertId, status: "active" } },
        select: { id: true },
      }),
      prisma.marketIqAlert.findUnique({ where: { id: sourceAlertId }, select: { headline: true, narrative: true } }),
    ]) : [null, null];
    if (requestedSignal && exposure) {
      const separator = requestedSignal.headline.indexOf(": ");
      const issueHeadline = alert?.headline ?? (separator >= 0 ? requestedSignal.headline.slice(separator + 2) : requestedSignal.headline);
      signal = { ...requestedSignal, headline: `${property.asset.name}: ${issueHeadline}`, narrative: alert?.narrative ?? requestedSignal.narrative };
    }
  }
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
