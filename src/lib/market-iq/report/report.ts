export const MARKET_IQ_REPORT_VERSION = 3 as const;

export type MarketIqPropertyType = "apartment" | "house";
export type MarketIqGeographyType = "msa" | "city" | "zip";

export type MarketIqTrendPoint = {
  rent: number;
  yearOverYearPct: number | null;
  observations: number;
  month: string;
  valueBasis?: "trends_value" | "trends_median_999";
};

export type MarketIqTrendSeries = {
  geographyType: MarketIqGeographyType;
  geographyValue: string;
  geographyLabel: string;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  points: MarketIqTrendPoint[];
};

export type MarketIqMarketCell = {
  key: string;
  label: string;
  geographyType: MarketIqGeographyType;
  geographyValue: string;
  geographyLabel: string;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  rent: number | null;
  yearOverYearPct: number | null;
  observations: number;
  month: string | null;
  valueBasis?: "trends_value" | "trends_median_999";
  series: MarketIqTrendPoint[];
  status: "reportable" | "suppressed";
  suppressionReason: string | null;
};

export type MarketIqMapPoint = {
  zip: string;
  label: string;
  latitude: number;
  longitude: number;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  rent: number | null;
  yearOverYearPct: number | null;
  observations: number;
  month: string | null;
  status: "reportable" | "suppressed";
  valueBasis?: "trends_value" | "trends_median_999";
};

export type MarketIqListingEvent = {
  id: string;
  eventType: "new_listing" | "price_change";
  city: string;
  zip: string;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  askingRent: number;
  previousRent: number | null;
  observedAt: string;
};

export type MarketIqMarketActivity = {
  asOf: string;
  newListings24h: number;
  sourceUpdates24h: number;
  confirmedPriceChanges24h: number;
  events: MarketIqListingEvent[];
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
    cities: string[];
    zipCodes: string[];
    segments: string[];
    periodStart: string;
    periodEnd: string;
    seededExample: boolean;
  };
  marketRead: {
    heading: string;
    narrative: string;
    cells: MarketIqMarketCell[];
    unavailableCuts: Array<{ label: string; reason: string }>;
  };
  marketMap: {
    heading: string;
    narrative: string;
    points: MarketIqMapPoint[];
  };
  marketConditions: {
    heading: string;
    narrative: string;
    historical: {
      activeAtCutoff: number;
      newListings30d: number;
      newListingsChange: number;
      medianDom: number;
    } | null;
  };
  marketActivity?: MarketIqMarketActivity;
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
  trendSeries: MarketIqTrendSeries[];
  mapCenters?: Record<string, { latitude: number; longitude: number }>;
  marketConditions: MarketIqReportSnapshot["marketConditions"];
  marketActivity?: MarketIqMarketActivity;
  sources: MarketIqReportSnapshot["sources"];
  unavailableCuts?: MarketIqReportSnapshot["marketRead"]["unavailableCuts"];
};

export const MIN_TREND_OBSERVATIONS = 10;

export function marketCellKey(
  geographyValue: string,
  propertyType: MarketIqPropertyType,
  bedrooms: number,
) {
  return `${geographyValue}:${propertyType}:${bedrooms}`;
}

export function segmentLabel(propertyType: MarketIqPropertyType, bedrooms: number): string {
  if (bedrooms === 999) return propertyType === "house" ? "All houses" : "All apartments";
  const bedroom = bedrooms === 0 ? "Studio" : `${bedrooms}-bedroom`;
  return `${bedroom} ${propertyType === "house" ? "houses" : "apartments"}`;
}

function buildCell(series: MarketIqTrendSeries): MarketIqMarketCell {
  const points = [...series.points]
    .filter((point) => point.rent > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  const latest = points.at(-1) ?? null;
  const reportable = Boolean(latest && latest.observations >= MIN_TREND_OBSERVATIONS);

  return {
    key: marketCellKey(series.geographyValue, series.propertyType, series.bedrooms),
    label: segmentLabel(series.propertyType, series.bedrooms),
    geographyType: series.geographyType,
    geographyValue: series.geographyValue,
    geographyLabel: series.geographyLabel,
    propertyType: series.propertyType,
    bedrooms: series.bedrooms,
    rent: reportable ? latest?.rent ?? null : null,
    yearOverYearPct: reportable ? latest?.yearOverYearPct ?? null : null,
    observations: latest?.observations ?? 0,
    month: latest?.month ?? null,
    valueBasis: latest?.valueBasis,
    series: reportable ? points.slice(-12) : [],
    status: reportable ? "reportable" : "suppressed",
    suppressionReason: reportable
      ? null
      : latest
        ? `Fewer than ${MIN_TREND_OBSERVATIONS} observations in the latest Trends IQ month`
        : "No Trends IQ rent observation is available",
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
  const cells = input.trendSeries
    .map(buildCell)
    .sort((a, b) => {
      const rank = (type: MarketIqGeographyType) => type === "msa" ? 0 : type === "city" ? 1 : 2;
      return rank(a.geographyType) - rank(b.geographyType) ||
        a.geographyLabel.localeCompare(b.geographyLabel) ||
        a.propertyType.localeCompare(b.propertyType) ||
        a.bedrooms - b.bedrooms;
    });
  const reportable = cells.filter((cell) => cell.status === "reportable");
  const directional = reportable.filter((cell) => cell.yearOverYearPct !== null);
  const rising = directional.filter((cell) => (cell.yearOverYearPct ?? 0) > 0).length;
  const narrative = directional.length
    ? `${rising} of ${directional.length} reportable Trends IQ segments are rising year over year. Every rent level and change below comes from the same validated Trends IQ series, with its monthly sample and date attached.`
    : "The read publishes only rent levels supported by Trends IQ and withholds any geography or segment that does not clear the sample threshold.";
  const mapPoints = cells.flatMap((cell) => {
    if (cell.geographyType !== "zip") return [];
    const center = input.mapCenters?.[cell.geographyValue];
    if (!center) return [];
    return [{
      zip: cell.geographyValue,
      label: cell.label,
      latitude: center.latitude,
      longitude: center.longitude,
      propertyType: cell.propertyType,
      bedrooms: cell.bedrooms,
      rent: cell.rent,
      yearOverYearPct: cell.yearOverYearPct,
      observations: cell.observations,
      month: cell.month,
      status: cell.status,
      valueBasis: cell.valueBasis,
    }];
  });

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
    marketMap: {
      heading: "Where rent direction is changing",
      narrative: "The map shades Census ZIP Code Tabulation Areas using ZIP-level Trends IQ observations only. Select a benchmark segment and measure without substituting broader city data.",
      points: mapPoints,
    },
    marketConditions: input.marketConditions,
    marketActivity: input.marketActivity,
    sources: input.sources,
    methodNote: `Every published rent input comes from Trends IQ. Overall apartment and house summaries use the median stored on the Trends IQ all-bedroom rows, with year-over-year change calculated from the matching prior-year median in that same Trends series. A segment requires at least ${MIN_TREND_OBSERVATIONS} observations in its latest month. Total IQ supports listing volume, velocity, days on market, and recent listing activity only. Census ZCTAs provide the ZIP-area geometry. Thin cells are suppressed rather than estimated.`,
    disclosure: "This report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.",
  };
}
