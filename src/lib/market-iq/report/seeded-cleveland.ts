import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

export const SEEDED_CLEVELAND_REPORT_TOKEN = "cleveland-owner-market-report-r3";

export const seededClevelandMarketReport: MarketIqReportSnapshot = {
  version: 1,
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
    marketName: "Cleveland–Elyria, OH",
    portfolioLabel: "Cleveland Managed Portfolio",
    propertyCount: 5,
    observedUnits: 178,
    observedListings: 237,
    submarkets: ["Downtown", "Midtown / University", "West Cleveland"],
    periodStart: "2025-08-01",
    periodEnd: "2026-07-31",
    seededExample: true,
  },
  portfolioPosition: {
    heading: "How Cleveland Managed Portfolio is positioned",
    narrative: "All three reportable portfolio segments are positioned above the observed asking-market median. This is advertised-rent positioning, not a conclusion about achieved rent or financial performance.",
    portfolioWide: [
      { key: "portfolio:apartment:0", label: "Studio apartments", geographyLabel: "Managed portfolio", propertyType: "apartment", bedrooms: 0, portfolio: { medianAskingRent: 999, observations: 65, properties: 2 }, market: { medianAskingRent: 750, observations: 84, properties: 20 }, positionPct: 33.2, status: "reportable", suppressionReason: null },
      { key: "portfolio:apartment:1", label: "1-bedroom apartments", geographyLabel: "Managed portfolio", propertyType: "apartment", bedrooms: 1, portfolio: { medianAskingRent: 1275, observations: 132, properties: 5 }, market: { medianAskingRent: 1015, observations: 640, properties: 93 }, positionPct: 25.6, status: "reportable", suppressionReason: null },
      { key: "portfolio:apartment:2", label: "2-bedroom apartments", geographyLabel: "Managed portfolio", propertyType: "apartment", bedrooms: 2, portfolio: { medianAskingRent: 1940, observations: 40, properties: 5 }, market: { medianAskingRent: 1200, observations: 389, properties: 173 }, positionPct: 61.7, status: "reportable", suppressionReason: null },
    ],
    submarkets: [
      { key: "submarket:Downtown:1", label: "1-bedroom apartments", geographyLabel: "Downtown", propertyType: "apartment", bedrooms: 1, portfolio: { medianAskingRent: 1425, observations: 24, properties: 2 }, market: { medianAskingRent: 1350, observations: 178, properties: 11 }, positionPct: 5.6, status: "reportable", suppressionReason: null },
      { key: "submarket:Downtown:2", label: "2-bedroom apartments", geographyLabel: "Downtown", propertyType: "apartment", bedrooms: 2, portfolio: { medianAskingRent: null, observations: 9, properties: 2 }, market: { medianAskingRent: null, observations: 74, properties: 11 }, positionPct: null, status: "suppressed", suppressionReason: "Fewer than 10 portfolio observations" },
      { key: "submarket:Midtown / University:0", label: "Studio apartments", geographyLabel: "Midtown / University", propertyType: "apartment", bedrooms: 0, portfolio: { medianAskingRent: null, observations: 65, properties: 2 }, market: { medianAskingRent: null, observations: 14, properties: 5 }, positionPct: null, status: "suppressed", suppressionReason: "Fewer than 30 market observations" },
      { key: "submarket:Midtown / University:1", label: "1-bedroom apartments", geographyLabel: "Midtown / University", propertyType: "apartment", bedrooms: 1, portfolio: { medianAskingRent: 1250, observations: 85, properties: 2 }, market: { medianAskingRent: 1200, observations: 275, properties: 44 }, positionPct: 4.2, status: "reportable", suppressionReason: null },
      { key: "submarket:Midtown / University:2", label: "2-bedroom apartments", geographyLabel: "Midtown / University", propertyType: "apartment", bedrooms: 2, portfolio: { medianAskingRent: 1899, observations: 15, properties: 2 }, market: { medianAskingRent: 1200, observations: 177, properties: 65 }, positionPct: 58.3, status: "reportable", suppressionReason: null },
      { key: "submarket:West Cleveland:1", label: "1-bedroom apartments", geographyLabel: "West Cleveland", propertyType: "apartment", bedrooms: 1, portfolio: { medianAskingRent: 1550, observations: 23, properties: 1 }, market: { medianAskingRent: 825, observations: 187, properties: 38 }, positionPct: 87.9, status: "reportable", suppressionReason: null },
      { key: "submarket:West Cleveland:2", label: "2-bedroom apartments", geographyLabel: "West Cleveland", propertyType: "apartment", bedrooms: 2, portfolio: { medianAskingRent: 2400, observations: 16, properties: 1 }, market: { medianAskingRent: 1000, observations: 138, properties: 97 }, positionPct: 140, status: "reportable", suppressionReason: null },
    ],
  },
  marketConditions: {
    heading: "Competitive supply expanded into the July cutoff",
    narrative: "New apartment and house listings increased 7.7% versus the prior 30-day period. Portfolio positioning should be read alongside this expanding advertised supply.",
    trendSegments: [],
    historical: { activeAtCutoff: 1211, newListings30d: 983, newListingsChange: 7.7, medianDom: 30, medianRentPerSqFt: 1.41 },
  },
  sources: [
    { name: "Cleveland historical listing export", availableThrough: "2026-07-31", observationCount: 54544, note: "Portfolio and market samples use listing activity observed during the trailing 12 months." },
  ],
  methodNote: "Cells require at least 10 portfolio observations, 30 market observations, and 5 external properties. Cells below any threshold are suppressed rather than generalized from fragile samples.",
  disclosure: "This report measures advertised asking-market activity. It does not measure occupancy, signed leases, concessions, effective rent, or property-level financial performance.",
};
