import {
  buildMarketIqReportSnapshot,
  type MarketIqPropertyType,
  type MarketIqTrendPoint,
  type MarketIqTrendSeries,
} from "@/lib/market-iq/report/report";

export const SEEDED_CLEVELAND_REPORT_TOKEN = "cleveland-local-market-read-r4";

export const CLEVELAND_ZIP_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  "44102": { latitude: 41.4767, longitude: -81.7398 },
  "44107": { latitude: 41.4821, longitude: -81.7974 },
  "44113": { latitude: 41.4828, longitude: -81.6968 },
  "44114": { latitude: 41.5094, longitude: -81.6743 },
  "44120": { latitude: 41.4734, longitude: -81.5849 },
  "44123": { latitude: 41.6035, longitude: -81.5254 },
};

const CLEVELAND_ZIP_TREND_POINTS: Record<string, MarketIqTrendPoint[]> = {
  "44102:apartment:2": [{ rent: 1120, yearOverYearPct: null, observations: 14, month: "2026-06-01" }],
  "44107:apartment:1": [{ rent: 1050, yearOverYearPct: null, observations: 13, month: "2026-07-01" }],
  "44113:apartment:1": [{ rent: 1199, yearOverYearPct: null, observations: 17, month: "2026-07-01" }],
  "44113:apartment:2": [{ rent: 1900, yearOverYearPct: null, observations: 10, month: "2026-06-01" }],
  "44114:apartment:1": [{ rent: 1341, yearOverYearPct: null, observations: 34, month: "2026-07-01" }],
  "44120:apartment:1": [{ rent: 999, yearOverYearPct: null, observations: 15, month: "2026-07-01" }],
  "44120:apartment:2": [{ rent: 1150, yearOverYearPct: null, observations: 35, month: "2026-06-01" }],
};

const proxy = (rent: number, observations: number, month: string): MarketIqTrendPoint => ({
  rent,
  observations,
  month,
  yearOverYearPct: null,
  valueBasis: "median_999_proxy",
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
  ["44102", "apartment", 995, 23, 875, 31], ["44102", "house", 1512.5, 10, 1375, 5],
  ["44107", "apartment", 995, 19, 1050, 18], ["44107", "house", 1975, 6, 2000, 1],
  ["44113", "apartment", 1699.5, 36, 1672, 34], ["44113", "house", 2100, 5, 1797, 1],
  ["44114", "apartment", 1500, 1, 1625, 4],
  ["44120", "apartment", 1212.5, 22, 1024.5, 30], ["44120", "house", 1550, 14, 1200, 10],
  ["44123", "apartment", 1250, 1, 1100, 3], ["44123", "house", 1397.5, 10, 1699, 9],
].map(([zip, propertyType, priorRent, priorN, latestRent, latestN]) => series({
  geographyType: "zip",
  geographyValue: String(zip),
  geographyLabel: `ZIP ${zip}`,
  propertyType: propertyType as MarketIqPropertyType,
  bedrooms: 999,
  points: withProxyYearOverYear([
    proxy(Number(priorRent), Number(priorN), "2025-05-01"),
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
  ...CITY_PRODUCT_ROLLUPS,
  ...ZIP_PRODUCT_ROLLUPS,
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "apartment", bedrooms: 1, points: [{ rent: 950, yearOverYearPct: 1.39, observations: 135, month: "2026-07-01" }] }),
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "apartment", bedrooms: 2, points: [{ rent: 1150, yearOverYearPct: -4.17, observations: 99, month: "2026-06-01" }] }),
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "house", bedrooms: 2, points: [{ rent: 1161, yearOverYearPct: 4.89, observations: 33, month: "2026-06-01" }] }),
  series({ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "house", bedrooms: 3, points: [{ rent: 1387, yearOverYearPct: -1.35, observations: 88, month: "2026-07-01" }] }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "apartment", bedrooms: 1, points: [{ rent: 1050, yearOverYearPct: 12, observations: 12, month: "2026-07-01" }] }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "apartment", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "house", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Lakewood, OH", geographyLabel: "Lakewood", propertyType: "house", bedrooms: 3 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "apartment", bedrooms: 1 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "apartment", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "house", bedrooms: 2 }),
  series({ geographyType: "city", geographyValue: "Euclid, OH", geographyLabel: "Euclid", propertyType: "house", bedrooms: 3 }),
  ...Object.keys(CLEVELAND_ZIP_CENTERS).flatMap((zip) => [
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "apartment" as const, bedrooms: 1, points: CLEVELAND_ZIP_TREND_POINTS[`${zip}:apartment:1`] }),
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "apartment" as const, bedrooms: 2, points: CLEVELAND_ZIP_TREND_POINTS[`${zip}:apartment:2`] }),
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "house" as const, bedrooms: 2 }),
    series({ geographyType: "zip" as const, geographyValue: zip, geographyLabel: `ZIP ${zip}`, propertyType: "house" as const, bedrooms: 3 }),
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
    zipCodes: Object.keys(CLEVELAND_ZIP_CENTERS),
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
  sources: [
    { name: "Dwellsy IQ Trends", availableThrough: "2026-07-31", observationCount: null, note: "The exclusive source for every published aggregated rent level and rent change. Overall product summaries temporarily use the stored median and an exact prior-year comparison from Trends IQ 999-bedroom rows. Per-cell sample sizes are shown with each result." },
    { name: "Total IQ observed listings", availableThrough: "2026-07-31", observationCount: 54_544, note: "Used only for listing volume, velocity, days on market, and geographic coverage. It is not used to calculate aggregated prices." },
  ],
});
