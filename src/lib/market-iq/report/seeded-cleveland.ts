import type { MarketIqMarketCell, MarketIqReportSnapshot, MarketIqTrajectory } from "@/lib/market-iq/report/report";

export const SEEDED_CLEVELAND_REPORT_TOKEN = "cleveland-local-market-read-r4";

function cell(input: {
  city: string;
  type: "apartment" | "house";
  bedrooms: number;
  rent: number | null;
  rentPerSqFt: number | null;
  observations: number;
  properties: number;
  rentPerSqFtObservations: number;
  trajectory?: MarketIqTrajectory;
  suppressed?: string;
}): MarketIqMarketCell {
  const bedroom = input.bedrooms === 0 ? "Studio" : `${input.bedrooms}-bedroom`;
  return {
    key: `${input.city}:${input.type}:${input.bedrooms}`,
    label: `${bedroom} ${input.type === "house" ? "houses" : "apartments"}`,
    geographyLabel: input.city,
    propertyType: input.type,
    bedrooms: input.bedrooms,
    rentLevel: {
      medianAskingRent: input.suppressed ? null : input.rent,
      medianRentPerSqFt: input.suppressed ? null : input.rentPerSqFt,
      observations: input.observations,
      properties: input.properties,
      rentPerSqFtObservations: input.rentPerSqFtObservations,
      availableThrough: "2026-07-31",
    },
    trajectory: input.trajectory ?? null,
    status: input.suppressed ? "suppressed" : "reportable",
    suppressionReason: input.suppressed ?? null,
  };
}

export const seededClevelandMarketReport: MarketIqReportSnapshot = {
  version: 2,
  generatedAt: "2026-08-14T00:00:00.000Z",
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
    submarkets: ["Cleveland", "Lakewood", "Euclid"],
    segments: ["Apartments by bedroom", "Houses by bedroom"],
    periodStart: "2025-08-01",
    periodEnd: "2026-07-31",
    totalObservedListings: 4_708,
    seededExample: true,
  },
  marketRead: {
    heading: "What is happening in Cleveland–Elyria, OH",
    narrative: "Cleveland’s observed asking market is split by product. Three-bedroom houses remain the deepest SFR segment, while apartment rent levels vary materially between Cleveland, Lakewood, and Euclid. Validated Trends show Cleveland 1-bedroom apartments up 1.4% year over year, while Cleveland 2-bedroom apartments softened 4.2% in the latest reportable month.",
    cells: [
      cell({ city: "Cleveland", type: "apartment", bedrooms: 1, rent: 999, rentPerSqFt: 1.67, observations: 1494, properties: 310, rentPerSqFtObservations: 1411, trajectory: { rent: 950, yearOverYearPct: 1.39, observations: 135, month: "2026-07-01" } }),
      cell({ city: "Cleveland", type: "apartment", bedrooms: 2, rent: 1100, rentPerSqFt: 1.31, observations: 1279, properties: 534, rentPerSqFtObservations: 1096, trajectory: { rent: 1150, yearOverYearPct: -4.17, observations: 99, month: "2026-06-01" } }),
      cell({ city: "Cleveland", type: "apartment", bedrooms: 3, rent: 1300, rentPerSqFt: 1.14, observations: 265, properties: 148, rentPerSqFtObservations: 229 }),
      cell({ city: "Cleveland", type: "house", bedrooms: 1, rent: 950, rentPerSqFt: 1.35, observations: 35, properties: 22, rentPerSqFtObservations: 21 }),
      cell({ city: "Cleveland", type: "house", bedrooms: 2, rent: 1095, rentPerSqFt: 1.17, observations: 314, properties: 190, rentPerSqFtObservations: 256, trajectory: { rent: 1161, yearOverYearPct: 4.89, observations: 33, month: "2026-06-01" } }),
      cell({ city: "Cleveland", type: "house", bedrooms: 3, rent: 1395, rentPerSqFt: 1.16, observations: 874, properties: 608, rentPerSqFtObservations: 790, trajectory: { rent: 1387, yearOverYearPct: -1.35, observations: 88, month: "2026-07-01" } }),
      cell({ city: "Lakewood", type: "apartment", bedrooms: 1, rent: 992.5, rentPerSqFt: 1.53, observations: 160, properties: 49, rentPerSqFtObservations: 152, trajectory: { rent: 1050, yearOverYearPct: 12, observations: 12, month: "2026-07-01" } }),
      cell({ city: "Lakewood", type: "apartment", bedrooms: 2, rent: 1250, rentPerSqFt: 1.52, observations: 93, properties: 43, rentPerSqFtObservations: 73 }),
      cell({ city: "Lakewood", type: "house", bedrooms: 2, rent: null, rentPerSqFt: null, observations: 29, properties: 16, rentPerSqFtObservations: 29, suppressed: "Fewer than 30 observed listings" }),
      cell({ city: "Euclid", type: "apartment", bedrooms: 1, rent: 925, rentPerSqFt: 1.39, observations: 69, properties: 36, rentPerSqFtObservations: 69 }),
      cell({ city: "Euclid", type: "apartment", bedrooms: 2, rent: 1100, rentPerSqFt: 1.47, observations: 149, properties: 51, rentPerSqFtObservations: 141 }),
      cell({ city: "Euclid", type: "house", bedrooms: 3, rent: 1500, rentPerSqFt: 1.19, observations: 144, properties: 104, rentPerSqFtObservations: 137 }),
    ],
    unavailableCuts: [{
      label: "Small multifamily versus large multifamily",
      reason: "Not published because community-size fields conflict for known Cleveland communities. Apartments remain grouped by bedroom until community identity is corrected.",
    }],
  },
  marketConditions: {
    heading: "New listing supply expanded into the July cutoff",
    narrative: "New apartment and house listings increased 7.7% versus the prior 30-day period. The increase was not uniform, so local rent direction should be read at the city and bedroom level rather than inferred from a single metro average.",
    historical: { activeAtCutoff: 1211, newListings30d: 983, newListingsChange: 7.7, medianDom: 30, medianRentPerSqFt: 1.41 },
  },
  sources: [
    { name: "Total IQ observed listings", availableThrough: "2026-07-31", observationCount: 54_544, note: "Rent levels, rent per square foot, supply, and listing velocity use observed asking listings, not modeled estimates." },
    { name: "Dwellsy IQ Trends", availableThrough: "2026-07-31", observationCount: 367, note: "Trajectory is published only for city and product segments with sufficient validated Trends depth." },
  ],
  methodNote: "Rent-level cells require at least 30 observed listings from 5 properties. Rent per square foot requires 20 valid square-footage observations. Trajectory requires 10 observations in its latest Trends month. Anything thinner is suppressed, not estimated.",
  disclosure: "This report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.",
};
