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
    cities: ["Cleveland", "Lakewood", "Euclid"],
    zipCodes: Object.keys(CLEVELAND_ZIP_CENTERS),
    segments: ["Apartments by bedroom", "Houses by bedroom"],
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
    { name: "Dwellsy IQ Trends", availableThrough: "2026-07-31", observationCount: 367, note: "The exclusive source for every published aggregated rent level and rent change." },
    { name: "Total IQ observed listings", availableThrough: "2026-07-31", observationCount: 54_544, note: "Used only for listing volume, velocity, days on market, and geographic coverage. It is not used to calculate aggregated prices." },
  ],
});
