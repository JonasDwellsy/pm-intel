export const MARKET_IQ_GEOGRAPHY_TYPES = ["msa", "city", "zip"] as const;
export const MARKET_IQ_PROPERTY_TYPES = ["apartment", "house"] as const;
export const MARKET_IQ_ALERT_CADENCES = ["daily", "weekly", "monthly"] as const;

export type MarketIqGeographyType = (typeof MARKET_IQ_GEOGRAPHY_TYPES)[number];
export type MarketIqPropertyType = (typeof MARKET_IQ_PROPERTY_TYPES)[number];
export type MarketIqAlertCadence = (typeof MARKET_IQ_ALERT_CADENCES)[number];

export interface MarketIqWatchlistInput {
  name: string;
  marketId: string;
  geographyType: MarketIqGeographyType;
  geographyValues: string[];
  propertyTypes: MarketIqPropertyType[];
  bedroomCounts: number[];
  alertsEnabled: boolean;
  alertCadence: MarketIqAlertCadence;
}

export interface MarketIqWatchlistView extends MarketIqWatchlistInput {
  id: string;
  updatedAt: string;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function uniqueStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function bedroomCounts(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(Number);
  if (values.some((item) => !Number.isInteger(item) || item < 0 || item > 5)) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}

export function parseMarketIqWatchlistInput(
  value: unknown,
  allowedMarketId: string
): { ok: true; value: MarketIqWatchlistInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Invalid request." };
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Name must be between 2 and 80 characters." };
  }
  if (input.marketId !== allowedMarketId) return { ok: false, error: "Market is not available." };
  if (!isOneOf(input.geographyType, MARKET_IQ_GEOGRAPHY_TYPES)) {
    return { ok: false, error: "Choose a valid geography type." };
  }
  const geographies = uniqueStrings(input.geographyValues);
  if (geographies === null || geographies.length > 25) {
    return { ok: false, error: "Choose no more than 25 geographies." };
  }
  if (input.geographyType !== "msa" && geographies.length === 0) {
    return { ok: false, error: "Add at least one city or ZIP code." };
  }
  const properties = uniqueStrings(input.propertyTypes);
  if (
    !properties ||
    properties.length === 0 ||
    !properties.every((item) => isOneOf(item, MARKET_IQ_PROPERTY_TYPES))
  ) {
    return { ok: false, error: "Choose apartment, house, or both." };
  }
  const bedrooms = bedroomCounts(input.bedroomCounts);
  if (bedrooms === null) return { ok: false, error: "Bedroom counts must be between 0 and 5." };
  if (!isOneOf(input.alertCadence, MARKET_IQ_ALERT_CADENCES)) {
    return { ok: false, error: "Choose a valid alert cadence." };
  }

  return {
    ok: true,
    value: {
      name,
      marketId: allowedMarketId,
      geographyType: input.geographyType,
      geographyValues: input.geographyType === "msa" ? [] : geographies,
      propertyTypes: properties as MarketIqPropertyType[],
      bedroomCounts: bedrooms,
      alertsEnabled: input.alertsEnabled !== false,
      alertCadence: input.alertCadence,
    },
  };
}

export function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
