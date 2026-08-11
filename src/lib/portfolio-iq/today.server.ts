import "server-only";
import { prisma } from "@/lib/prisma";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { loadPortfolioDecisionHistory, loadPortfolioWatchSignals } from "@/lib/portfolio-iq/watch.server";
import { selectTodaySignals } from "@/lib/portfolio-iq/today";
import { loadDwellsyIqInsights } from "@/lib/dwellsy-iq/insights.server";
import { loadOperatorResponseContexts } from "@/lib/dwellsy-iq/operator-response.server";

export async function loadOwnerToday(input: { organizationId: string; userId: string }) {
  const portfolio = await loadPortfolioIqHome(input);
  if (!portfolio) return null;

  const [unifiedInsights, fallbackSignals, digestPreference, decisionHistory, trendPulses] = await Promise.all([
    loadDwellsyIqInsights(portfolio.id),
    loadPortfolioWatchSignals(portfolio.id),
    prisma.portfolioIqDigestPreference.findUnique({
      where: { portfolioId_userId: { portfolioId: portfolio.id, userId: input.userId } },
    }),
    loadPortfolioDecisionHistory(portfolio.id),
    loadClevelandTrendPulses().catch(() => []),
  ]);
  const signals = unifiedInsights.length ? unifiedInsights : fallbackSignals.map((signal) => ({
    ...signal,
    unifiedInsightId: "",
    sourceAlertId: null,
    geographyType: null,
    geographyValue: null,
    propertyType: null,
    bedrooms: null,
    evidenceSources: "[]",
    exposures: [],
  }));
  const todaySignals = selectTodaySignals(signals, 5);
  const uniqueSlugs = [...new Set(todaySignals.flatMap((signal) => signal.asset?.slug ? [signal.asset.slug] : []))];
  const propertyResults = await Promise.all(uniqueSlugs.map((slug) => loadPortfolioIqProperty({ ...input, slug })));
  const properties = new Map(propertyResults.flatMap((property) => property ? [[property.asset.slug, property] as const] : []));
  const operatorResponses = await loadOperatorResponseContexts({
    marketId: portfolio.marketId,
    assets: portfolio.assets,
  });

  return { portfolio, signals, todaySignals, digestPreference, decisionHistory, trendPulses, properties, operatorResponses };
}
