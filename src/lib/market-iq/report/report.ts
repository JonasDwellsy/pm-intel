import type {
  MarketIqMarketActivity,
  MarketIqMarketActivityAvailability,
} from "@/lib/market-iq/listing-events";

export type {
  MarketIqListingEvent,
  MarketIqMarketActivity,
  MarketIqMarketActivityAvailability,
} from "@/lib/market-iq/listing-events";

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
  primaryCity: string | null;
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
  series: MarketIqTrendPoint[];
};

export function buildDwellsyPropertyUrl(propertyId: string | number) {
  const value = String(propertyId);
  return /^\d+$/.test(value) ? `https://dwellsy.com/details/${value}` : null;
}

export function formatMarketIqListingAddress(parts: Array<string | null | undefined>) {
  const address = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join(", ");
  return address || null;
}

function offsetMonth(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1)).toISOString().slice(0, 10);
}

export function trendHistoryQueryStart(referenceDate: Date) {
  // Fetch four calendar years, then publish at most the latest 36 actual
  // observations per cell. The extra year preserves a complete trajectory
  // when an otherwise valid source series has occasional unpublished months.
  return offsetMonth(referenceDate, -48);
}

export function trendHistoryWindowStart(latestMonth: string) {
  return offsetMonth(new Date(`${latestMonth.slice(0, 7)}-01T00:00:00Z`), -35);
}

export type MarketIqEditionFinding = {
  id: string;
  kind: "direction_change" | "rent_move" | "coverage_change" | "listing_change";
  importance: "high" | "medium";
  headline: string;
  detail: string;
  geographyType: MarketIqGeographyType | "market";
  geographyLabel: string;
  segmentLabel: string | null;
  currentValue: number | null;
  priorValue: number | null;
  currentMonth: string | null;
  priorMonth: string | null;
  observations: number | null;
};

export type MarketIqEditionComparison = {
  state: "baseline" | "unchanged" | "changed";
  heading: string;
  narrative: string;
  priorReportId: string | null;
  priorPeriodLabel: string | null;
  priorPublishedAt: string | null;
  findings: MarketIqEditionFinding[];
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
  marketActivity?: MarketIqMarketActivityAvailability;
  editionComparison?: MarketIqEditionComparison;
  editorial?: {
    audienceKind?: "client" | "prospect";
    headline: string | null;
    introduction: string | null;
    companyProfile?: string | null;
    companyCtaLabel?: string | null;
    companyCtaUrl?: string | null;
    reviewedAt: string;
    reviewedBy: string;
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
  trendSeries: MarketIqTrendSeries[];
  mapCenters?: Record<string, { latitude: number; longitude: number; primaryCity?: string | null }>;
  marketConditions: MarketIqReportSnapshot["marketConditions"];
  marketActivity?: MarketIqMarketActivityAvailability;
  sources: MarketIqReportSnapshot["sources"];
  unavailableCuts?: MarketIqReportSnapshot["marketRead"]["unavailableCuts"];
};

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

export function buildCurrentMonthUnavailableCuts(input: {
  trendSeries: MarketIqTrendSeries[];
  currentMonth: string;
  geographies: Array<{
    geographyType: MarketIqGeographyType;
    geographyValue: string;
    label: string;
  }>;
  segments: Array<{
    propertyType: MarketIqPropertyType;
    bedrooms: number;
  }>;
}): MarketIqReportSnapshot["marketRead"]["unavailableCuts"] {
  const monthLabel = (value: string) => new Date(`${value.slice(0, 7)}-15T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  return input.segments.flatMap((segment) => {
    const missing = input.geographies.flatMap((geography) => {
      const series = input.trendSeries.find((candidate) =>
        candidate.geographyType === geography.geographyType &&
        candidate.geographyValue === geography.geographyValue &&
        candidate.propertyType === segment.propertyType &&
        candidate.bedrooms === segment.bedrooms,
      );
      const hasCurrentMonth = series?.points.some((point) => point.month === input.currentMonth) ?? false;
      return hasCurrentMonth ? [] : [{ ...geography, latestMonth: series?.points.map((point) => point.month).sort().at(-1) ?? null }];
    });
    if (!missing.length) return [];

    const locations = missing.map((geography) => geography.label);
    const locationText = locations.length === 1
      ? locations[0]
      : `${locations.slice(0, -1).join(", ")} or ${locations.at(-1)}`;
    const latestMonths = [...new Set(missing.map((geography) => geography.latestMonth).filter((value): value is string => Boolean(value)))];
    const latestText = latestMonths.length === 1
      ? ` The latest available evidence for the missing ${missing.length === 1 ? "location is" : "locations is"} ${monthLabel(latestMonths[0])}.`
      : " No earlier value is substituted for the missing current-month evidence.";

    return [{
      label: `${segmentLabel(segment.propertyType, segment.bedrooms)} · ${monthLabel(input.currentMonth)}`,
      reason: `Dwellsy IQ Trends did not publish a ${monthLabel(input.currentMonth)} value for ${locationText}.${latestText}`,
    }];
  });
}

function buildCell(series: MarketIqTrendSeries): MarketIqMarketCell {
  const points = [...series.points]
    .filter((point) => point.rent > 0)
    .sort((a, b) => a.month.localeCompare(b.month));
  const latest = points.at(-1) ?? null;
  const reportable = Boolean(latest);

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
    series: reportable ? points.slice(-36) : [],
    status: reportable ? "reportable" : "suppressed",
    suppressionReason: reportable
      ? null
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
      parsed.scope.seededExample !== false ||
      !Array.isArray(parsed.marketRead?.cells) ||
      !Array.isArray(parsed.sources)
    ) return null;
    const snapshot = parsed as MarketIqReportSnapshot;
    const legacyActivity = parsed.marketActivity as unknown;
    if (
      legacyActivity &&
      typeof legacyActivity === "object" &&
      !("state" in legacyActivity) &&
      "asOf" in legacyActivity &&
      "events" in legacyActivity &&
      typeof legacyActivity.asOf === "string" &&
      Array.isArray(legacyActivity.events)
    ) {
      snapshot.marketActivity = {
        state: "available",
        activity: legacyActivity as MarketIqMarketActivity,
      };
    }
    return snapshot;
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
    ? `${rising} of ${directional.length} published Trends IQ segments are rising year over year. Every rent level and change below comes directly from the validated Trends IQ series, with its date attached.`
    : "The read publishes every available Trends IQ value and withholds only geography or segment combinations for which Trends IQ has no value.";
  const mapPoints = cells.flatMap((cell) => {
    if (cell.geographyType !== "zip") return [];
    const center = input.mapCenters?.[cell.geographyValue];
    if (!center) return [];
    return [{
      zip: cell.geographyValue,
      label: cell.label,
      primaryCity: center.primaryCity ?? null,
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
      series: cell.series,
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
    methodNote: "Every published rent input comes from Trends IQ. Overall apartment and house summaries use the median stored on the Trends IQ all-bedroom rows, with year-over-year change calculated from the matching prior-year median in that same Trends series. A published Trends IQ value is treated as reportable because Dwellsy's underlying methodology has already established confidence in that result. Unit counts are retained as source metadata but are not used as an additional publication threshold. Total IQ supports listing volume, velocity, days on market, and recent listing activity only. Census ZCTAs provide ZIP-area geometry.",
    disclosure: "This report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.",
  };
}
