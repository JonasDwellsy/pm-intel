import {
  buildMarketIqReportSnapshot,
  type MarketIqPropertyType,
  type MarketIqTrendPoint,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";
import { SEEDED_CLEVELAND_ZIP_BENCHMARK_SERIES } from "@/lib/market-iq/report/seeded-cleveland-zip-series";
import clevelandMsaZips from "@/data/market-iq/cleveland-msa-zips.json";
import { CLEVELAND_ZIP_CENTERS } from "@/lib/market-iq/geography/cleveland-zip-centers";

export const SEEDED_CLEVELAND_REPORT_TOKEN = "cleveland-local-market-read-r4";

const CLEVELAND_ZIP_TREND_POINTS: Record<string, MarketIqTrendPoint[]> = {
  ...SEEDED_CLEVELAND_ZIP_BENCHMARK_SERIES,
  "44102:apartment:2": [{ rent: 1120, yearOverYearPct: null, observations: 14, month: "2026-06-01" }],
  "44113:apartment:2": [{ rent: 1900, yearOverYearPct: null, observations: 10, month: "2026-06-01" }],
  "44120:apartment:2": [{ rent: 1150, yearOverYearPct: null, observations: 35, month: "2026-06-01" }],
};

const proxy = (rent: number, observations: number, month: string): MarketIqTrendPoint => ({
  rent,
  observations,
  month,
  yearOverYearPct: null,
  valueBasis: "trends_median_999",
});

function withProxyYearOverYear(points: MarketIqTrendPoint[]) {
  const rents = new Map(points.map((point) => [point.month, point.rent]));
  return points.map((point) => {
    const current = new Date(`${point.month.slice(0, 7)}-01T00:00:00Z`);
    const priorMonth = `${current.getUTCFullYear() - 1}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const prior = rents.get(priorMonth);
    return { ...point, yearOverYearPct: prior && prior > 0 ? ((point.rent / prior) - 1) * 100 : null };
  });
}

const MSA_PRODUCT_ROLLUPS: MarketIqTrendSeries[] = [
  series({ geographyType: "msa", geographyValue: "17460", geographyLabel: "Cleveland-Elyria, OH", propertyType: "apartment", bedrooms: 999, points: withProxyYearOverYear([
    proxy(1205, 377, "2025-04-01"), proxy(1250, 448, "2025-05-01"), proxy(1175, 422, "2025-06-01"),
    proxy(1165, 469, "2025-07-01"), proxy(1095, 419, "2025-08-01"), proxy(1000, 322, "2025-09-01"),
    proxy(1000, 439, "2025-10-01"), proxy(1045, 367, "2025-11-01"), proxy(937, 301, "2025-12-01"),
    proxy(1050, 376, "2026-05-01"),
  ]) }),
  series({ geographyType: "msa", geographyValue: "17460", geographyLabel: "Cleveland-Elyria, OH", propertyType: "house", bedrooms: 999, points: withProxyYearOverYear([
    proxy(1400, 190, "2025-04-01"), proxy(1468, 263, "2025-05-01"), proxy(1400, 248, "2025-06-01"),
    proxy(1450, 292, "2025-07-01"), proxy(1495, 293, "2025-08-01"), proxy(1450, 256, "2025-09-01"),
    proxy(1400, 275, "2025-10-01"), proxy(1400, 316, "2025-11-01"), proxy(1400, 246, "2025-12-01"),
    proxy(1495, 211, "2026-05-01"),
  ]) }),
];

const CITY_PRODUCT_ROLLUPS: MarketIqTrendSeries[] = [
  ["Cleveland", "apartment", 1285, 207, 1100, 241], ["Cleveland", "house", 1400, 115, 1400, 95],
  ["Cleveland Heights", "apartment", 1290, 17, 949, 11], ["Cleveland Heights", "house", 1800, 15, 1700, 10],
  ["Euclid", "house", 1395, 21, 1545, 13], ["Garfield Heights", "house", 1495, 13, 1500, 11],
  ["Lakewood", "apartment", 995, 18, 1050, 18], ["Lorain", "house", 1400, 28, 1100, 17],
  ["Maple Heights", "house", 1525, 16, 1645, 14], ["Willoughby", "apartment", 1160, 11, 1375, 12],
].map(([city, propertyType, priorRent, priorN, latestRent, latestN]) => series({
  geographyType: "city",
  geographyValue: `${city}, OH`,
  geographyLabel: String(city),
  propertyType: propertyType as MarketIqPropertyType,
  bedrooms: 999,
  points: withProxyYearOverYear([
    proxy(Number(priorRent), Number(priorN), "2025-05-01"),
    proxy(Number(latestRent), Number(latestN), "2026-05-01"),
  ]),
}));

const ZIP_PRODUCT_ROLLUPS: MarketIqTrendSeries[] = [
  ["44094", "apartment", 1280, 13, 1375, 12],
  ["44102", "apartment", 995, 23, 875, 31],
  ["44105", "apartment", 925, 11, 925, 10],
  ["44106", "apartment", 1391.25, 36, 1250, 51],
  ["44107", "apartment", 995, 19, 1050, 18],
  ["44109", "apartment", 825, 11, 1150, 16],
  ["44110", "apartment", 757.5, 10, 937, 12],
  ["44112", "apartment", 0, 0, 750, 31],
  ["44113", "apartment", 1699.5, 36, 1672, 34],
  ["44118", "apartment", 1237.5, 12, 900, 11],
  ["44120", "apartment", 1212.5, 22, 1024.5, 30],
  ["44052", "house", 1410, 14, 1100, 11],
  ["44105", "house", 1300, 16, 1395, 17],
  ["44108", "house", 1200, 13, 1224.5, 12],
  ["44120", "house", 1550, 14, 1200, 10],
  ["44125", "house", 1495, 18, 1500, 15],
  ["44128", "house", 1400, 13, 1425, 12],
  ["44137", "house", 1525, 16, 1645, 14],
].map(([zip, propertyType, priorRent, priorN, latestRent, latestN]) => series({
  geographyType: "zip",
  geographyValue: String(zip),
  geographyLabel: `ZIP ${zip}`,
  propertyType: propertyType as MarketIqPropertyType,
  bedrooms: 999,
  points: withProxyYearOverYear([
    ...(Number(priorRent) > 0 ? [proxy(Number(priorRent), Number(priorN), "2025-05-01")] : []),
    proxy(Number(latestRent), Number(latestN), "2026-05-01"),
  ]),
}));

function series(input: {
  geographyType: "msa" | "city" | "zip";
  geographyValue: string;
  geographyLabel: string;
  propertyType: MarketIqPropertyType;
  bedrooms: number;
  points?: MarketIqTrendPoint[];
}): MarketIqTrendSeries {
  return { ...input, points: input.points ?? [] };
}

export const SEEDED_CLEVELAND_TREND_SERIES: MarketIqTrendSeries[] = [
  ...MSA_PRODUCT_ROLLUPS,
  series({ geographyType: "msa", geographyValue: "17460", geographyLabel: "Cleveland-Elyria, OH", propertyType: "apartment", bedrooms: 1, points: [
    { rent: 925, yearOverYearPct: 2.78, observations: 194, month: "2026-05-01", valueBasis: "trends_value" },
    { rent: 950, yearOverYearPct: 2.7, observations: 204, month: "2026-06-01", valueBasis: "trends_value" },
    { rent: 950, yearOverYearPct: 1.39, observations: 253, month: "2026-07-01", valueBasis: "trends_value" },
  ] }),
  series({ geographyType: "msa", geographyValue: "17460", geographyLabel: "Cleveland-Elyria, OH", propertyType: "apartment", bedrooms: 2, points: [
    { rent: 1150, yearOverYearPct: -2.13, observations: 162, month: "2026-05-01", valueBasis: "trends_value" },
    { rent: 1150, yearOverYearPct: -4.17, observations: 202, month: "2026-06-01", valueBasis: "trends_value" },
  ] }),
  series({ geographyType: "msa", geographyValue: "17460", geographyLabel: "Cleveland-Elyria, OH", propertyType: "house", bedrooms: 2, points: [
    { rent: 1168, yearOverYearPct: 3.92, observations: 42, month: "2026-05-01", valueBasis: "trends_value" },
    { rent: 1168, yearOverYearPct: 2.3, observations: 58, month: "2026-06-01", valueBasis: "trends_value" },
  ] }),
  series({ geographyType: "msa", geographyValue: "17460", geographyLabel: "Cleveland-Elyria, OH", propertyType: "house", bedrooms: 3, points: [
    { rent: 1510, yearOverYearPct: 3.86, observations: 122, month: "2026-05-01", valueBasis: "trends_value" },
    { rent: 1508, yearOverYearPct: 2.68, observations: 157, month: "2026-06-01", valueBasis: "trends_value" },
    { rent: 1536, yearOverYearPct: 3.27, observations: 181, month: "2026-07-01", valueBasis: "trends_value" },
  ] }),
  ...CITY_PRODUCT_ROLLUPS,
  ...ZIP_PRODUCT_ROLLUPS,
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "apartment", bedrooms: 1, points: [{ rent: 950, yearOverYearPct: 1.39, observations: 135, month: "2026-07-01", valueBasis: "trends_value" }] }),
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "apartment", bedrooms: 2, points: [{ rent: 1150, yearOverYearPct: -4.17, observations: 99, month: "2026-06-01" }] }),
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "house", bedrooms: 2, points: [{ rent: 1161, yearOverYearPct: 4.89, observations: 33, month: "2026-06-01" }] }),
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "house", bedrooms: 3, points: [{ rent: 1387, yearOverYearPct: -1.35, observations: 88, month: "2026-07-01", valueBasis: "trends_value" }] }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "apartment", bedrooms: 1, points: [{ rent: 1050, yearOverYearPct: 12, observations: 12, month: "2026-07-01", valueBasis: "trends_value" }] }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "apartment", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "house", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "house", bedrooms: 3 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "apartment", bedrooms: 1 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "apartment", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "house", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "house", bedrooms: 3 }),
  series({ geographyType: "city", geographyValue: "Maple Heights, OH", geographyLabel: "Maple Heights", propertyType: "apartment", bedrooms: 1, points: [{ rent: 680, yearOverYearPct: -2.51, observations: 10, month: "2026-07-01", valueBasis: "trends_value" }] }),
  series({ geographyType: "city", geographyValue: "Maple Heights, OH", geographyLabel: "Maple Heights", propertyType: "apartment", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Maple Heights, OH", geographyLabel: "Maple Heights", propertyType: "house", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Maple Heights, OH", geographyLabel: "Maple Heights", propertyType: "house", bedrooms: 3, points: [{ rent: 1669, yearOverYearPct: 12.22, observations: 10, month: "2026-07-01", valueBasis: "trends_value" }] }),
  ...Object.keys(CLEVELAND_ZIP_CENTERS).flatMap((zip) => [
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "apartment" as const, bedrooms: 1, points: CLEVELAND_ZIP_TREND_POINTS[`${zip}:apartment:1`] }),
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "apartment" as const, bedrooms: 2, points: CLEVELAND_ZIP_TREND_POINTS[`${zip}:apartment:2`] }),
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "house" as const, bedrooms: 2 }),
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "house" as const, bedrooms: 3, points: CLEVELAND_ZIP_TREND_POINTS[`${zip}:house:3`] }),
  ]),
];

export const seededClevelandMarketReport = buildMarketIqReportSnapshot({
  generatedAt: new Date("2026-08-14T00:00:00.000Z"),
  brand: {
    displayName: "Harborview Residential",
    logoUrl: null,
    primaryColor: "#173B57",
    accentColor: "#B96D3A",
    contactName: "Client Advisory Team",
    contactEmail: "advisory@example.com",
    contactPhone: null,
    websiteUrl: null,
  },
  scope: {
    marketId: "cleveland-elyria-mentor-oh",
    marketName: "Cleveland-Elyria, OH",
    cities: ["Cleveland", "Cleveland Heights", "Euclid", "Garfield Heights", "Lakewood", "Lorain", "Maple Heights", "Willoughby"],
    zipCodes: clevelandMsaZips,
    segments: ["All apartments", "All houses", "Apartments by bedroom", "Houses by bedroom"],
    periodStart: "2025-08-01",
    periodEnd: "2026-07-31",
    seededExample: true,
  },
  trendSeries: SEEDED_CLEVELAND_TREND_SERIES,
  mapCenters: CLEVELAND_ZIP_CENTERS,
  unavailableCuts: [{
    label: "Small multifamily versus large multifamily",
    reason: "Not published because community-size fields conflict for known Cleveland communities. Apartments remain grouped by bedroom until community identity is corrected.",
  }],
  marketConditions: {
    heading: "New listing supply expanded into the July cutoff",
    narrative: "Total IQ observed more new apartment and house listings than in the prior 30-day period. That listing-activity evidence is presented separately from Trends IQ rent statistics and is not used to calculate a rent level or change.",
    historical: { activeAtCutoff: 1211, newListings30d: 983, newListingsChange: 7.7, medianDom: 30 },
  },
  marketActivity: {
    asOf: "2026-08-15T00:07:12.000Z",
    newListings24h: 45,
    sourceUpdates24h: 396,
    confirmedPriceChanges24h: 0,
    events: [
      { id: "seed:new:44113", eventType: "new_listing", city: "Cleveland", zip: "44113", propertyType: "apartment", bedrooms: 1, askingRent: 1199, previousRent: null, observedAt: "2026-08-14T23:02:54.000Z" },
      { id: "seed:new:44128", eventType: "new_listing", city: "Cleveland", zip: "44128", propertyType: "house", bedrooms: 4, askingRent: 1750, previousRent: null, observedAt: "2026-08-14T22:42:00.000Z" },
      { id: "seed:new:44108", eventType: "new_listing", city: "Cleveland", zip: "44108", propertyType: "house", bedrooms: 3, askingRent: 1300, previousRent: null, observedAt: "2026-08-14T22:18:00.000Z" },
      { id: "seed:new:44052", eventType: "new_listing", city: "Lorain", zip: "44052", propertyType: "apartment", bedrooms: 1, askingRent: 799, previousRent: null, observedAt: "2026-08-14T21:44:00.000Z" },
      { id: "seed:new:44106", eventType: "new_listing", city: "Cleveland Heights", zip: "44106", propertyType: "apartment", bedrooms: 3, askingRent: 2000, previousRent: null, observedAt: "2026-08-14T21:03:00.000Z" },
      { id: "seed:new:44120", eventType: "new_listing", city: "Cleveland", zip: "44120", propertyType: "apartment", bedrooms: 3, askingRent: 1475, previousRent: null, observedAt: "2026-08-14T20:51:00.000Z" },
      { id: "seed:new:44130", eventType: "new_listing", city: "Cleveland", zip: "44130", propertyType: "house", bedrooms: 2, askingRent: 1900, previousRent: null, observedAt: "2026-08-14T20:29:00.000Z" },
    ],
  },
  sources: [
    { name: "Dwellsy IQ Trends", availableThrough: "2026-07-31", observationCount: null, note: "The exclusive source for every published aggregated rent level and rent change. Overall product summaries use the stored median and an exact prior-year comparison from Trends IQ all-bedroom rows. Every available Trends IQ value is reportable." },
    { name: "Total IQ observed listings", availableThrough: "2026-07-31", observationCount: 54_544, note: "Used only for listing volume, velocity, days on market, and geographic coverage. It is not used to calculate aggregated prices." },
    { name: "Total IQ listing activity feed", availableThrough: "2026-08-14", observationCount: 7, note: "Used only for the recent-listing ticker and source activity counts. It is not used to calculate aggregated prices." },
    { name: "U.S. Census Bureau ZCTAs", availableThrough: "2020-01-01", observationCount: 101, note: "Provides 101 shaded ZIP Code Tabulation Area boundaries for the 102 active postal ZIPs in the Dwellsy Cleveland-Elyria MSA definition. Postal ZIP 44061 has no Census ZCTA polygon." },
  ],
});
