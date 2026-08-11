export type SourceRefreshSegment = { propertyType: "apartment" | "house"; bedrooms: number };
export type SourceRefreshGeography = {
  geographyType: "msa" | "city" | "zip";
  geographyValue: string;
  requiredSegments: SourceRefreshSegment[];
};

export type SourceRefreshAsset = {
  city: string;
  postalCode: string;
  assetType: string;
};

export type SourceRefreshTrendRow = {
  month: Date;
  propertyType: string;
  bedrooms: number;
  observations: number;
  yearOverYearPct: number | null;
};

const APARTMENT_SEGMENTS: SourceRefreshSegment[] = [0, 1, 2, 3].map((bedrooms) => ({ propertyType: "apartment", bedrooms }));
const HOUSE_SEGMENTS: SourceRefreshSegment[] = [2, 3, 4].map((bedrooms) => ({ propertyType: "house", bedrooms }));

function segmentKey(segment: { propertyType: string; bedrooms: number }): string {
  return `${segment.propertyType}:${segment.bedrooms}`;
}

function segmentsForAssets(assets: SourceRefreshAsset[]): SourceRefreshSegment[] {
  const hasApartments = assets.some((asset) => asset.assetType === "multifamily");
  const hasHouses = assets.some((asset) => asset.assetType === "single_family");
  return [...(hasApartments ? APARTMENT_SEGMENTS : []), ...(hasHouses ? HOUSE_SEGMENTS : [])];
}

export function buildSourceRefreshManifest(marketId: string, assets: SourceRefreshAsset[]): SourceRefreshGeography[] {
  const rows: SourceRefreshGeography[] = [{ geographyType: "msa", geographyValue: marketId, requiredSegments: segmentsForAssets(assets) }];
  const cityMap = new Map<string, SourceRefreshAsset[]>();
  const zipMap = new Map<string, SourceRefreshAsset[]>();
  for (const asset of assets) {
    cityMap.set(asset.city, [...(cityMap.get(asset.city) ?? []), asset]);
    zipMap.set(asset.postalCode, [...(zipMap.get(asset.postalCode) ?? []), asset]);
  }
  for (const [city, scoped] of [...cityMap].sort(([left], [right]) => left.localeCompare(right))) {
    rows.push({ geographyType: "city", geographyValue: city, requiredSegments: segmentsForAssets(scoped) });
  }
  for (const [postalCode, scoped] of [...zipMap].sort(([left], [right]) => left.localeCompare(right))) {
    rows.push({ geographyType: "zip", geographyValue: postalCode, requiredSegments: segmentsForAssets(scoped) });
  }
  return rows;
}

export function trendSnapshotFreshness(availableThrough: Date | null, now = new Date(), maxAgeDays = 75): "fresh" | "stale" | "unavailable" {
  if (!availableThrough || Number.isNaN(availableThrough.getTime())) return "unavailable";
  const ageDays = (now.getTime() - availableThrough.getTime()) / 86_400_000;
  if (ageDays < -7 || ageDays > maxAgeDays) return "stale";
  return "fresh";
}

export function validateTrendRefreshItem(input: {
  rows: SourceRefreshTrendRow[];
  requiredSegments: SourceRefreshSegment[];
  now?: Date;
}) {
  if (!input.rows.length) return { status: "invalid" as const, availableThrough: null, reportableSegments: 0, missingSegments: input.requiredSegments.map(segmentKey) };
  const availableThrough = input.rows.reduce((latest, row) => row.month > latest ? row.month : latest, input.rows[0].month);
  const latestReportable = new Set(input.rows.filter((row) =>
    row.month.getTime() === availableThrough.getTime()
    && row.observations >= 3
    && row.yearOverYearPct !== null
  ).map(segmentKey));
  const missingSegments = input.requiredSegments.map(segmentKey).filter((key) => !latestReportable.has(key));
  const freshness = trendSnapshotFreshness(availableThrough, input.now);
  const status = freshness === "stale" ? "stale" : latestReportable.size === 0 ? "invalid" : missingSegments.length ? "sparse" : "complete";
  return { status, availableThrough, reportableSegments: latestReportable.size, missingSegments };
}

export function summarizeSourceRefreshItems(items: Array<{ status: string; recordCount: number; sourceAvailableThrough: Date | null }>) {
  const terminal = new Set(["complete", "sparse", "stale", "invalid"]);
  const received = items.filter((item) => terminal.has(item.status));
  const pending = items.length - received.length;
  const valid = received.filter((item) => item.status === "complete" || item.status === "sparse");
  const coverageThrough = valid.flatMap((item) => item.sourceAvailableThrough ? [item.sourceAvailableThrough] : []).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    received: received.length,
    pending,
    recordCount: received.reduce((sum, item) => sum + item.recordCount, 0),
    sourceAvailableThrough: coverageThrough,
    status: pending > 0 ? "receiving" : received.some((item) => item.status !== "complete") ? "complete_with_gaps" : "complete",
  };
}
