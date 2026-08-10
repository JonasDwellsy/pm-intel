export const CLEVELAND_MARKET_ID = "cleveland-elyria-mentor-oh";

export const clevelandPilot = {
  market: "Cleveland–Elyria, OH",
  liveListingSource: {
    name: "Dwellsy Rental Search MCP",
    status: "unavailable" as const,
    message:
      "Live listing events are paused while the source connection is unavailable. No substitute records are shown.",
  },
} as const;
