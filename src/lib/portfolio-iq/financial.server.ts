import "server-only";
import { prisma } from "@/lib/prisma";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { calculateFinancialImpact, financialImpactPriority } from "@/lib/portfolio-iq/financial";

export async function loadPortfolioIqFinancialPriority(input: { organizationId: string; userId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;
  const assumptions = await prisma.portfolioIqFinancialAssumption.findMany({ where: { asset: { portfolioId: portfolio.id } } });
  const assumptionMap = new Map(assumptions.map((assumption) => [`${assumption.assetId}:${assumption.bedrooms}`, assumption]));
  const propertyResults = await Promise.all(portfolio.assets.map((asset) => loadPortfolioIqProperty({ ...input, slug: asset.slug })));
  const items = propertyResults.flatMap((property) => {
    if (!property) return [];
    const propertyAssumption = assumptionMap.get(`${property.asset.id}:-1`) ?? null;
    const isSingleFamily = property.asset.assetType === "single_family";
    const inventoryUnits = propertyAssumption?.inventoryUnits ?? property.asset.unitCount ?? (isSingleFamily ? 1 : null);
    const affectedUnits = propertyAssumption?.affectedUnits ?? (isSingleFamily ? 1 : null);
    const assumptionSource = propertyAssumption ? "owner" as const : isSingleFamily ? "single_family_default" as const : "missing" as const;
    const impact = calculateFinancialImpact({
      askingRent: property.performance.askingRent,
      compAskingRent: property.performance.compAskingRent,
      observationCount: property.performance.observationCount,
      compCount: property.compSet?.members.length ?? 0,
      compLocked: property.compSet?.status === "locked",
      inventoryUnits,
      affectedUnits,
      realizationPct: propertyAssumption?.realizationPct ?? 0.5,
      conservativePct: propertyAssumption?.conservativePct,
      upsidePct: propertyAssumption?.upsidePct,
      assumptionSource,
    });
    const segments = property.segments.map((segment) => {
      const assumption = assumptionMap.get(`${property.asset.id}:${segment.bedrooms}`) ?? null;
      const segmentDefault = isSingleFamily && segment.performance.observationCount > 0;
      const segmentImpact = calculateFinancialImpact({
        askingRent: segment.performance.askingRent,
        compAskingRent: segment.performance.compAskingRent,
        observationCount: segment.performance.observationCount,
        compCount: segment.compPropertyCount,
        compLocked: segment.isLocked,
        inventoryUnits: assumption?.inventoryUnits ?? (segmentDefault ? 1 : null),
        affectedUnits: assumption?.affectedUnits ?? (segmentDefault ? 1 : null),
        realizationPct: assumption?.realizationPct ?? propertyAssumption?.realizationPct ?? 0.5,
        conservativePct: assumption?.conservativePct ?? propertyAssumption?.conservativePct,
        upsidePct: assumption?.upsidePct ?? propertyAssumption?.upsidePct,
        assumptionSource: assumption ? "owner" : segmentDefault ? "single_family_default" : "missing",
      });
      return { ...segment, assumption, impact: segmentImpact };
    });
    const signal = property.signals.find((candidate) => candidate.category === "performance") ?? property.signals[0] ?? null;
    return [{ property, assumption: propertyAssumption, impact, segments, signal, priority: financialImpactPriority(impact) }];
  }).sort((left, right) => right.priority - left.priority);
  const estimated = items.filter((item) => item.impact.status === "estimated");
  return {
    portfolio,
    items,
    totalAnnualAdjusted: estimated.reduce((sum, item) => sum + (item.impact.annualRealizationAdjusted ?? 0), 0),
    estimatedCount: estimated.length,
    assumptionsNeeded: items.filter((item) => item.impact.status === "assumptions_needed").length,
    evidenceNeeded: items.filter((item) => ["comps_needed", "subject_evidence_needed"].includes(item.impact.status)).length,
  };
}
