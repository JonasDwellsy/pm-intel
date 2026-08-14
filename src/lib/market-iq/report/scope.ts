import {
  MIN_TREND_OBSERVATIONS,
  segmentLabel,
  type MarketIqMarketCell,
  type MarketIqPropertyType,
  type MarketIqReportSnapshot,
} from "@/lib/market-iq/report/report";

export const MARKET_IQ_REPORT_CITIES = ["Cleveland", "Lakewood", "Euclid"] as const;
export const MARKET_IQ_REPORT_ZIPS = ["44102", "44107", "44113", "44114", "44120", "44123"] as const;
export const MARKET_IQ_REPORT_SEGMENTS = [
  { key: "apartment:1", propertyType: "apartment", bedrooms: 1, label: "1-bedroom apartments" },
  { key: "apartment:2", propertyType: "apartment", bedrooms: 2, label: "2-bedroom apartments" },
  { key: "house:2", propertyType: "house", bedrooms: 2, label: "2-bedroom houses" },
  { key: "house:3", propertyType: "house", bedrooms: 3, label: "3-bedroom houses" },
] as const;

export type MarketIqSegmentKey = typeof MARKET_IQ_REPORT_SEGMENTS[number]["key"];
export type MarketIqReportScopeSelection = {
  cities: string[];
  zipCodes: string[];
  segments: MarketIqSegmentKey[];
};

export type MarketIqCoverageStatus = "reportable" | "thin" | "stale" | "unavailable";
export type MarketIqCoverageCell = {
  key: string;
  geographyLabel: string;
  geographyType: MarketIqMarketCell["geographyType"];
  segmentLabel: string;
  status: MarketIqCoverageStatus;
  observations: number;
  month: string | null;
  reason: string;
};

const MAX_TREND_AGE_DAYS = 75;

function allowedValues(values: string[], allowed: readonly string[]) {
  return [...new Set(values.filter((value) => allowed.includes(value)))];
}

export function defaultMarketIqScopeSelection(): MarketIqReportScopeSelection {
  return {
    cities: [...MARKET_IQ_REPORT_CITIES],
    zipCodes: [...MARKET_IQ_REPORT_ZIPS],
    segments: MARKET_IQ_REPORT_SEGMENTS.map((segment) => segment.key),
  };
}

export function normalizeMarketIqScopeSelection(input: Partial<MarketIqReportScopeSelection>): MarketIqReportScopeSelection {
  const defaults = defaultMarketIqScopeSelection();
  const cities = input.cities === undefined ? defaults.cities : allowedValues(input.cities, MARKET_IQ_REPORT_CITIES);
  const zipCodes = input.zipCodes === undefined ? defaults.zipCodes : allowedValues(input.zipCodes, MARKET_IQ_REPORT_ZIPS);
  const segments = input.segments === undefined ? defaults.segments : allowedValues(input.segments, MARKET_IQ_REPORT_SEGMENTS.map((segment) => segment.key)) as MarketIqSegmentKey[];
  return {
    cities,
    zipCodes,
    segments,
  };
}

export function parseMarketIqScopeFormData(formData: FormData) {
  return normalizeMarketIqScopeSelection({
    cities: formData.getAll("cities").map(String),
    zipCodes: formData.getAll("zipCodes").map(String),
    segments: formData.getAll("segments").map(String) as MarketIqSegmentKey[],
  });
}

function segmentKey(propertyType: MarketIqPropertyType, bedrooms: number): MarketIqSegmentKey | null {
  const key = `${propertyType}:${bedrooms}`;
  return MARKET_IQ_REPORT_SEGMENTS.some((segment) => segment.key === key) ? key as MarketIqSegmentKey : null;
}

function daysBetween(start: string, end: string) {
  const startTime = new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime();
  const endTime = new Date(`${end.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.floor((endTime - startTime) / 86_400_000));
}

export function marketIqCoverageStatus(cell: MarketIqMarketCell, periodEnd: string): MarketIqCoverageStatus {
  if (cell.month && daysBetween(cell.month, periodEnd) > MAX_TREND_AGE_DAYS) return "stale";
  if (cell.status === "reportable") return "reportable";
  if (cell.observations > 0 && cell.observations < MIN_TREND_OBSERVATIONS) return "thin";
  return "unavailable";
}

function selectedCell(cell: MarketIqMarketCell, selection: MarketIqReportScopeSelection) {
  const key = segmentKey(cell.propertyType, cell.bedrooms);
  if (!key || !selection.segments.includes(key)) return false;
  if (cell.geographyType === "msa") return true;
  if (cell.geographyType === "city") return selection.cities.includes(cell.geographyLabel);
  return selection.zipCodes.includes(cell.geographyValue);
}

function suppressStaleCell(cell: MarketIqMarketCell, periodEnd: string): MarketIqMarketCell {
  if (marketIqCoverageStatus(cell, periodEnd) !== "stale") return cell;
  return {
    ...cell,
    rent: null,
    yearOverYearPct: null,
    series: [],
    status: "suppressed",
    suppressionReason: `Latest Trends IQ month is more than ${MAX_TREND_AGE_DAYS} days older than the report cutoff`,
  };
}

export function applyMarketIqReportScope(
  snapshot: MarketIqReportSnapshot,
  rawSelection: Partial<MarketIqReportScopeSelection>,
): MarketIqReportSnapshot {
  const selection = normalizeMarketIqScopeSelection(rawSelection);
  const cells = snapshot.marketRead.cells
    .filter((cell) => selectedCell(cell, selection))
    .map((cell) => suppressStaleCell(cell, snapshot.scope.periodEnd));
  const cellKeys = new Set(cells.map((cell) => cell.key));
  const mapPoints = snapshot.marketMap.points.filter((point) => {
    const key = segmentKey(point.propertyType, point.bedrooms);
    return Boolean(key && selection.segments.includes(key) && selection.zipCodes.includes(point.zip) && cellKeys.has(`${point.zip}:${point.propertyType}:${point.bedrooms}`));
  }).map((point) => {
    const cell = cells.find((candidate) => candidate.key === `${point.zip}:${point.propertyType}:${point.bedrooms}`);
    return cell ? { ...point, rent: cell.rent, yearOverYearPct: cell.yearOverYearPct, observations: cell.observations, month: cell.month, status: cell.status } : point;
  });
  const directional = cells.filter((cell) => cell.status === "reportable" && cell.yearOverYearPct !== null);
  const rising = directional.filter((cell) => (cell.yearOverYearPct ?? 0) > 0).length;
  const narrative = directional.length
    ? `${rising} of ${directional.length} selected Trends IQ segments are rising year over year. Every published rent level and change uses the same validated monthly series, with its sample and date attached.`
    : "No selected geography and segment currently clears the Trends IQ sample and freshness thresholds. Unsupported cells remain visible but unpublished.";
  const selectedSegments = MARKET_IQ_REPORT_SEGMENTS
    .filter((segment) => selection.segments.includes(segment.key))
    .map((segment) => segmentLabel(segment.propertyType, segment.bedrooms));

  return {
    ...snapshot,
    scope: { ...snapshot.scope, cities: selection.cities, zipCodes: selection.zipCodes, segments: selectedSegments },
    marketRead: { ...snapshot.marketRead, narrative, cells },
    marketMap: { ...snapshot.marketMap, points: mapPoints },
  };
}

export function buildMarketIqCoveragePreflight(snapshot: MarketIqReportSnapshot): {
  cells: MarketIqCoverageCell[];
  counts: Record<MarketIqCoverageStatus, number>;
  canPublish: boolean;
} {
  const cells = snapshot.marketRead.cells.map((cell) => {
    const status = marketIqCoverageStatus(cell, snapshot.scope.periodEnd);
    const reason = status === "reportable"
      ? `Trends IQ · N=${cell.observations.toLocaleString("en-US")} · ${cell.month}`
      : status === "thin"
        ? `Latest month has N=${cell.observations}; minimum is ${MIN_TREND_OBSERVATIONS}`
        : status === "stale"
          ? `Latest observation is ${cell.month}; it is outside the freshness window`
          : cell.suppressionReason ?? "No Trends IQ observation is available";
    return {
      key: cell.key,
      geographyLabel: cell.geographyLabel,
      geographyType: cell.geographyType,
      segmentLabel: cell.label,
      status,
      observations: cell.observations,
      month: cell.month,
      reason,
    } satisfies MarketIqCoverageCell;
  });
  const counts = cells.reduce<Record<MarketIqCoverageStatus, number>>((result, cell) => {
    result[cell.status] += 1;
    return result;
  }, { reportable: 0, thin: 0, stale: 0, unavailable: 0 });
  return { cells, counts, canPublish: counts.reportable > 0 };
}
