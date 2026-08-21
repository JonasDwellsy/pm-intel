export type MarketIqResolutionSegment = {
  key: string;
  label: string;
  sampleSize: number;
  medianDays: number;
  p25Days: number;
  p75Days: number;
};

export type MarketIqTimeToResolution = {
  asOf: string;
  windowStart: string;
  windowEnd: string;
  sampleSize: number;
  medianDays: number;
  p25Days: number;
  p75Days: number;
  p90Days: number;
  bedroomSegments: MarketIqResolutionSegment[];
  rentBands: MarketIqResolutionSegment[];
};

export type MarketIqTimeToResolutionAvailability =
  | { state: "available"; resolution: MarketIqTimeToResolution }
  | { state: "unavailable"; attemptedAt: string };

export async function readMarketIqTimeToResolutionAvailability(
  read: () => Promise<MarketIqTimeToResolution>,
  attemptedAt = new Date(),
): Promise<MarketIqTimeToResolutionAvailability> {
  try {
    return { state: "available", resolution: await read() };
  } catch {
    return { state: "unavailable", attemptedAt: attemptedAt.toISOString() };
  }
}

export function availableMarketIqTimeToResolution(
  availability: MarketIqTimeToResolutionAvailability | undefined,
) {
  return availability?.state === "available" ? availability.resolution : undefined;
}
