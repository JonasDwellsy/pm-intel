export const MARKET_IQ_REPORT_VERSION = 2 as const;

export type MarketIqPropertyType = "apartment" | "house";

export type MarketIqMarketObservation = {
  id: string;
  propertyKey: string;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  city: string;
  postalCode: string;
  submarket: string;
  askingRent: number;
  squareFeet: number | null;
};

export type MarketIqTrajectory = {
  rent: number;
  yearOverYearPct: number;
  observations: number;
  month: string;
};

export type MarketIqMarketCell = {
  key: string;
  label: string;
  geographyLabel: string;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  rentLevel: {
    medianAskingRent: number | null;
    medianRentPerSqFt: number | null;
    observations: number;
    properties: number;
    rentPerSqFtObservations: number;
    availableThrough: string;
  };
  trajectory: MarketIqTrajectory | null;
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
    submarkets: string[];
    segments: string[];
    periodStart: string;
    periodEnd: string;
    totalObservedListings: number;
    seededExample: boolean;
  };
  marketRead: {
    heading: string;
    narrative: string;
    cells: MarketIqMarketCell[];
    unavailableCuts: Array<{ label: string; reason: string }>;
  };
  marketConditions: {
    heading: string;
    narrative: string;
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

export type MarketIqReportBuildInput = {
  generatedAt: Date;
  brand: MarketIqReportSnapshot["brand"];
  scope: MarketIqReportSnapshot["scope"];
  observations: MarketIqMarketObservation[];
  trajectories: Map<string, MarketIqTrajectory>;
  marketConditions: MarketIqReportSnapshot["marketConditions"];
  sources: MarketIqReportSnapshot["sources"];
  unavailableCuts?: MarketIqReportSnapshot["marketRead"]["unavailableCuts"];
};

export const MIN_MARKET_OBSERVATIONS = 30;
export const MIN_MARKET_PROPERTIES = 5;
export const MIN_TREND_OBSERVATIONS = 10;
export const MIN_RENT_PER_SQ_FT_OBSERVATIONS = 20;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function marketCellKey(submarket: string, propertyType: MarketIqPropertyType, bedrooms: number) {
  return `${submarket}:${propertyType}:${bedrooms}`;
}

export function segmentLabel(propertyType: MarketIqPropertyType, bedrooms: number): string {
  const bedroom = bedrooms === 0 ? "Studio" : `${bedrooms}-bedroom`;
  return `${bedroom} ${propertyType === "house" ? "houses" : "apartments"}`;
}

function buildCell(input: {
  submarket: string;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  observations: MarketIqMarketObservation[];
  trajectory: MarketIqTrajectory | null;
  availableThrough: string;
}): MarketIqMarketCell {
  const properties = new Set(input.observations.map((item) => item.propertyKey)).size;
  const rentPerSqFt = input.observations.flatMap((item) =>
    item.squareFeet && item.squareFeet > 0 ? [item.askingRent / item.squareFeet] : []
  );
  const reasons = [
    input.observations.length < MIN_MARKET_OBSERVATIONS
      ? `Fewer than ${MIN_MARKET_OBSERVATIONS} observed listings`
      : null,
    properties < MIN_MARKET_PROPERTIES
      ? `Fewer than ${MIN_MARKET_PROPERTIES} observed properties`
      : null,
  ].filter((reason): reason is string => Boolean(reason));
  const reportable = reasons.length === 0;
  const trajectory = input.trajectory && input.trajectory.observations >= MIN_TREND_OBSERVATIONS
    ? input.trajectory
    : null;

  return {
    key: marketCellKey(input.submarket, input.propertyType, input.bedrooms),
    label: segmentLabel(input.propertyType, input.bedrooms),
    geographyLabel: input.submarket,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms,
    rentLevel: {
      medianAskingRent: reportable ? median(input.observations.map((item) => item.askingRent)) : null,
      medianRentPerSqFt: reportable && rentPerSqFt.length >= MIN_RENT_PER_SQ_FT_OBSERVATIONS
        ? median(rentPerSqFt)
        : null,
      observations: input.observations.length,
      properties,
      rentPerSqFtObservations: rentPerSqFt.length,
      availableThrough: input.availableThrough,
    },
    trajectory,
    status: reportable ? "reportable" : "suppressed",
    suppressionReason: reportable ? null : reasons.join("; "),
  };
}

export function parseMarketIqReportSnapshot(value: string): MarketIqReportSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<MarketIqReportSnapshot>;
    if (
      parsed.version !== MARKET_IQ_REPORT_VERSION ||
      !parsed.brand?.displayName ||
      !parsed.scope?.marketName ||
      !Array.isArray(parsed.marketRead?.cells) ||
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
  const combinations = new Map<string, { submarket: string; propertyType: MarketIqPropertyType; bedrooms: number }>();
  for (const item of input.observations) {
    combinations.set(marketCellKey(item.submarket, item.propertyType, item.bedrooms), {
      submarket: item.submarket,
      propertyType: item.propertyType,
      bedrooms: item.bedrooms,
    });
  }
  const cells = [...combinations.values()]
    .map((combination) => buildCell({
      ...combination,
      observations: input.observations.filter((item) =>
        item.submarket === combination.submarket &&
        item.propertyType === combination.propertyType &&
        item.bedrooms === combination.bedrooms
      ),
      trajectory: input.trajectories.get(marketCellKey(
        combination.submarket,
        combination.propertyType,
        combination.bedrooms
      )) ?? null,
      availableThrough: input.scope.periodEnd,
    }))
    .sort((a, b) => a.geographyLabel.localeCompare(b.geographyLabel) ||
      a.propertyType.localeCompare(b.propertyType) || a.bedrooms - b.bedrooms);
  const reportable = cells.filter((cell) => cell.status === "reportable");
  const withTrajectory = reportable.filter((cell) => cell.trajectory);
  const rising = withTrajectory.filter((cell) => (cell.trajectory?.yearOverYearPct ?? 0) > 0).length;
  const narrative = withTrajectory.length
    ? `${rising} of ${withTrajectory.length} reportable local segments with sufficient Trends depth are rising year over year. Rent levels below come from observed listings; trajectory comes only from the validated Trends engine.`
    : "The read publishes observed local rent levels and suppresses any trajectory without sufficient validated Trends depth.";

  return {
    version: MARKET_IQ_REPORT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    brand: input.brand,
    scope: input.scope,
    marketRead: {
      heading: `What is happening in ${input.scope.marketName}`,
      narrative,
      cells,
      unavailableCuts: input.unavailableCuts ?? [],
    },
    marketConditions: input.marketConditions,
    sources: input.sources,
    methodNote: `Rent-level cells require at least ${MIN_MARKET_OBSERVATIONS} observed listings from ${MIN_MARKET_PROPERTIES} properties. Rent per square foot requires ${MIN_RENT_PER_SQ_FT_OBSERVATIONS} valid square-footage observations. Trajectory requires ${MIN_TREND_OBSERVATIONS} observations in its latest Trends month. Anything thinner is suppressed, not estimated.`,
    disclosure: "This report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.",
  };
}
