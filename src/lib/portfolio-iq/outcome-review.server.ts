import "server-only";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { decisionBaselineExposures, parseDecisionBaseline } from "@/lib/portfolio-iq/decision-case";
import { buildOutcomeComparison, parseOutcomeComparison } from "@/lib/portfolio-iq/outcome-review";

export async function loadPortfolioIqOutcomes(input: { organizationId: string; userId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;
  const decisions = await prisma.portfolioIqSignalDecision.findMany({
    where: { organizationId: portfolio.organizationId, baselineEvidence: { not: null } },
    include: { signal: { include: { asset: { select: { id: true, slug: true, name: true } } } }, outcomeReviews: { orderBy: { generatedAt: "desc" }, take: 1 } },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
  });
  const baselines = new Map(decisions.flatMap((decision) => {
    const baseline = parseDecisionBaseline(decision.baselineEvidence);
    return baseline ? [[decision.id, baseline] as const] : [];
  }));
  const propertySlugs = [...new Set(decisions.flatMap((decision) => {
    const baseline = baselines.get(decision.id);
    const exposureSlugs = baseline ? decisionBaselineExposures(baseline).flatMap((exposure) => exposure.asset.slug ? [exposure.asset.slug] : []) : [];
    return exposureSlugs.length ? exposureSlugs : decision.signal.asset?.slug ? [decision.signal.asset.slug] : [];
  }))];
  const properties = new Map((await Promise.all(propertySlugs.map((slug) => loadPortfolioIqProperty({ ...input, slug })))).flatMap((property) => property ? [[property.asset.slug, property] as const] : []));
  const now = new Date();
  const items = decisions.flatMap((decision) => {
    const baseline = baselines.get(decision.id);
    if (!baseline) return [];
    const property = decision.signal.asset?.slug ? properties.get(decision.signal.asset.slug) ?? null : null;
    const current = property ? { availableThrough: property.availableThrough?.toISOString() ?? null, askingRent: property.performance.askingRent, askingRentChange90d: property.performance.askingRentChange90d, medianDom: property.performance.medianDom, observationCount: property.performance.observationCount } : null;
    const currentExposures = decisionBaselineExposures(baseline).map((exposure) => {
      const currentProperty = exposure.asset.slug ? properties.get(exposure.asset.slug) ?? null : null;
      return { assetId: exposure.asset.id, property: currentProperty ? { availableThrough: currentProperty.availableThrough?.toISOString() ?? null, askingRent: currentProperty.performance.askingRent, askingRentChange90d: currentProperty.performance.askingRentChange90d, medianDom: currentProperty.performance.medianDom, observationCount: currentProperty.performance.observationCount } : null };
    });
    const liveComparison = buildOutcomeComparison({ baseline, current, currentExposures, actionPlan: decision.actionPlan, successMeasure: decision.successMeasure, generatedAt: now });
    const savedReview = decision.outcomeReviews[0] ?? null;
    return [{ decision, property, comparison: savedReview ? parseOutcomeComparison(savedReview.comparison) ?? liveComparison : liveComparison, liveComparison, savedReview, due: Boolean(decision.dueAt && decision.dueAt <= now) }];
  });
  return { portfolio, items, readyCount: items.filter((item) => item.liveComparison.sourceHealth === "healthy" && !item.savedReview?.reviewedAt).length, waitingCount: items.filter((item) => item.liveComparison.sourceHealth !== "healthy").length, reviewedCount: items.filter((item) => Boolean(item.savedReview?.reviewedAt)).length, dueCount: items.filter((item) => item.due && !item.savedReview?.reviewedAt).length };
}
