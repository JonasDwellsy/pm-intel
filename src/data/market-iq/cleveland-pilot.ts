export const CLEVELAND_MARKET_ID = "cleveland-elyria-mentor-oh";

export const clevelandPilot = {
  market: "Cleveland–Elyria, OH",
  trendSource: {
    name: "Dwellsy IQ Rent Trends",
    availableThrough: "2026-06-01",
  },
  historicalSource: {
    name: "Cleveland historical listing export",
    availableThrough: "2026-07-31",
    recordCount: 54_544,
  },
  liveListingSource: {
    name: "Dwellsy Rental Search MCP",
    status: "unavailable" as const,
    message:
      "Live listing events are paused while the source connection is unavailable. No substitute records are shown.",
  },
  segments: [
    { label: "1-bed apartment", rent: 950, yoy: 6.15, observations: 204 },
    { label: "2-bed apartment", rent: 1_150, yoy: 1.37, observations: 202 },
    { label: "2-bed house", rent: 1_200, yoy: 3.85, observations: 58 },
    { label: "3-bed house", rent: 1_601, yoy: 4.36, observations: 157 },
  ],
  historical: {
    activeAtCutoff: 1_211,
    newListings30d: 983,
    newListingsChange: 7.7,
    medianDom: 30.01,
    medianRentPerSqFt: 1.41,
  },
  places: [
    { name: "Cleveland", newListings: 504, change: 11.3, medianDom: 33.83, rentPerSqFt: 1.42 },
    { name: "Lakewood", newListings: 36, change: 16.1, medianDom: 33.15, rentPerSqFt: 1.55 },
    { name: "Euclid", newListings: 37, change: 8.8, medianDom: 35.41, rentPerSqFt: 1.42 },
    { name: "Cleveland Heights", newListings: 37, change: 2.8, medianDom: 25.12, rentPerSqFt: 1.29 },
    { name: "Garfield Heights", newListings: 19, change: 11.8, medianDom: 36.45, rentPerSqFt: 1.15 },
    { name: "Shaker Heights", newListings: 18, change: -43.8, medianDom: 24.69, rentPerSqFt: 1.29 },
  ],
} as const;
