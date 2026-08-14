export const MARKET_IQ_REPORT_VERSION = 1 as const;

export type MarketIqReportCell = {
  key: string;
  label: string;
  geographyLabel: string;
  propertyType: "apartment" | "house";
  bedrooms: number;
  portfolio: { medianAskingRent: number | null; observations: number; properties: number };
  market: { medianAskingRent: number | null; observations: number; properties: number };
  positionPct: number | null;
  status: "reportable" | "suppressed";
  suppressionReason: string | null;
};

export interface MarketIqReportSnapshot {
  version: typeof MARKET_IQ_REPORT_VERSION;
  generatedAt: string;
  brand: {
    displayName: string;
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    websiteUrl: string | null;
  };
  scope: {
    marketId: string;
    marketName: string;
    portfolioLabel: string;
    propertyCount: number;
    observedUnits: number;
    observedListings: number;
    submarkets: string[];
    periodStart: string;
    periodEnd: string;
    seededExample: boolean;
  };
  portfolioPosition: {
    heading: string;
    narrative: string;
    portfolioWide: MarketIqReportCell[];
    submarkets: MarketIqReportCell[];
  };
  marketConditions: {
    heading: string;
    narrative: string;
    trendSegments: Array<{ label: string; rent: number; yoy: number; observations: number }>;
    historical: {
      activeAtCutoff: number;
      newListings30d: number;
      newListingsChange: number;
      medianDom: number;
      medianRentPerSqFt: number;
    } | null;
  };
  sources: Array<{
    name: string;
    availableThrough: string;
    observationCount: number | null;
    note: string;
  }>;
  methodNote: string;
  disclosure: string;
}

export type MarketIqPortfolioObservation = {
  id: string;
  propertyKey: string;
  propertyType: "apartment" | "house";
  bedrooms: number;
  postalCode: string;
  submarket: string;
  askingRent: number;
  inPortfolio: boolean;
};

export type MarketIqReportBuildInput = {
  generatedAt: Date;
  brand: MarketIqReportSnapshot["brand"];
  scope: MarketIqReportSnapshot["scope"];
  observations: MarketIqPortfolioObservation[];
  marketConditions: MarketIqReportSnapshot["marketConditions"];
  sources: MarketIqReportSnapshot["sources"];
};

const MIN_PORTFOLIO_OBSERVATIONS = 10;
const MIN_MARKET_OBSERVATIONS = 30;
const MIN_MARKET_PROPERTIES = 5;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function positionPct(portfolio: number | null, market: number | null): number | null {
  if (portfolio === null || market === null || market === 0) return null;
  return ((portfolio - market) / market) * 100;
}

function buildCell(input: {
  key: string;
  label: string;
  geographyLabel: string;
  propertyType: "apartment" | "house";
  bedrooms: number;
  portfolio: MarketIqPortfolioObservation[];
  market: MarketIqPortfolioObservation[];
}): MarketIqReportCell {
  const portfolioProperties = new Set(input.portfolio.map((item) => item.propertyKey)).size;
  const marketProperties = new Set(input.market.map((item) => item.propertyKey)).size;
  const portfolioRent = median(input.portfolio.map((item) => item.askingRent));
  const marketRent = median(input.market.map((item) => item.askingRent));
  const reasons = [
    input.portfolio.length < MIN_PORTFOLIO_OBSERVATIONS
      ? `Fewer than ${MIN_PORTFOLIO_OBSERVATIONS} portfolio observations`
      : null,
    input.market.length < MIN_MARKET_OBSERVATIONS
      ? `Fewer than ${MIN_MARKET_OBSERVATIONS} market observations`
      : null,
    marketProperties < MIN_MARKET_PROPERTIES
      ? `Fewer than ${MIN_MARKET_PROPERTIES} external market properties`
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const reportable = reasons.length === 0;

  return {
    key: input.key,
    label: input.label,
    geographyLabel: input.geographyLabel,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms,
    portfolio: {
      medianAskingRent: reportable ? portfolioRent : null,
      observations: input.portfolio.length,
      properties: portfolioProperties,
    },
    market: {
      medianAskingRent: reportable ? marketRent : null,
      observations: input.market.length,
      properties: marketProperties,
    },
    positionPct: reportable ? positionPct(portfolioRent, marketRent) : null,
    status: reportable ? "reportable" : "suppressed",
    suppressionReason: reportable ? null : reasons.join("; "),
  };
}

function segmentLabel(bedrooms: number): string {
  return bedrooms === 0 ? "Studio apartments" : `${bedrooms}-bedroom apartments`;
}

export function parseMarketIqReportSnapshot(value: string): MarketIqReportSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<MarketIqReportSnapshot>;
    if (
      parsed.version !== MARKET_IQ_REPORT_VERSION ||
      !parsed.brand?.displayName ||
      !parsed.scope?.marketName ||
      !Array.isArray(parsed.portfolioPosition?.portfolioWide) ||
      !Array.isArray(parsed.sources)
    ) return null;
    return parsed as MarketIqReportSnapshot;
  } catch {
    return null;
  }
}

export function isPublicMarketIqReportStatus(status: string) {
  return status === "published";
}

export function buildMarketIqReportSnapshot(input: MarketIqReportBuildInput): MarketIqReportSnapshot {
  const propertyTypes = ["apartment"] as const;
  const bedrooms = [...new Set(
    input.observations.filter((item) => item.inPortfolio).map((item) => item.bedrooms)
  )].sort((a, b) => a - b);
  const submarkets = [...new Set(
    input.observations.filter((item) => item.inPortfolio).map((item) => item.submarket)
  )].sort();

  const portfolioWide = propertyTypes.flatMap((propertyType) => bedrooms.map((bedroomCount) => {
    const portfolio = input.observations.filter(
      (item) => item.inPortfolio && item.propertyType === propertyType && item.bedrooms === bedroomCount
    );
    const market = input.observations.filter(
      (item) => !item.inPortfolio && item.propertyType === propertyType && item.bedrooms === bedroomCount
    );
    return buildCell({
      key: `portfolio:${propertyType}:${bedroomCount}`,
      label: segmentLabel(bedroomCount),
      geographyLabel: "Managed portfolio",
      propertyType,
      bedrooms: bedroomCount,
      portfolio,
      market,
    });
  }));

  const submarketCells = submarkets.flatMap((submarket) => {
    const submarketBedrooms = bedrooms.filter((bedroomCount) => input.observations.some(
      (item) => item.inPortfolio && item.submarket === submarket && item.bedrooms === bedroomCount
    ));
    return submarketBedrooms.map((bedroomCount) => {
    const portfolio = input.observations.filter(
      (item) => item.inPortfolio && item.submarket === submarket && item.bedrooms === bedroomCount
    );
    const market = input.observations.filter(
      (item) => !item.inPortfolio && item.submarket === submarket && item.bedrooms === bedroomCount
    );
    return buildCell({
      key: `submarket:${submarket}:${bedroomCount}`,
      label: segmentLabel(bedroomCount),
      geographyLabel: submarket,
      propertyType: "apartment",
      bedrooms: bedroomCount,
      portfolio,
      market,
    });
    });
  });

  const reportableWide = portfolioWide.filter((cell) => cell.status === "reportable");
  const aboveMarket = reportableWide.filter((cell) => (cell.positionPct ?? 0) > 0).length;
  const narrative = reportableWide.length
    ? `${aboveMarket} of ${reportableWide.length} reportable portfolio segments are positioned above the observed asking-market median. This is advertised-rent positioning, not a conclusion about achieved rent or financial performance.`
    : "No portfolio-wide segment met the report's minimum sample requirements for a defensible comparison.";

  return {
    version: MARKET_IQ_REPORT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    brand: input.brand,
    scope: input.scope,
    portfolioPosition: {
      heading: `How ${input.scope.portfolioLabel} is positioned`,
      narrative,
      portfolioWide,
      submarkets: submarketCells,
    },
    marketConditions: input.marketConditions,
    sources: input.sources,
    methodNote: `Cells require at least ${MIN_PORTFOLIO_OBSERVATIONS} portfolio observations, ${MIN_MARKET_OBSERVATIONS} market observations, and ${MIN_MARKET_PROPERTIES} external properties. Cells below any threshold are suppressed rather than generalized from fragile samples.`,
    disclosure: "This report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.",
  };
}
