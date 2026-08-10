export const CLEVELAND_MARKET_ID = "cleveland-elyria-mentor-oh";

export const clevelandPilot = {
  market: "Cleveland–Elyria, OH",
  trendSource: {
    name: "Dwellsy IQ Rent Trends",
    availableThrough: "2026-06-01",
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
} as const;
