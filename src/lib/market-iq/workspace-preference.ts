import {
  defaultMarketIqScopeSelection,
  normalizeMarketIqScopeSelection,
  type MarketIqReportScopeSelection,
} from "@/lib/market-iq/report/scope";

function stringArray(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : undefined;
  } catch {
    return undefined;
  }
}

export function marketIqSelectionFromPreference(preference: {
  defaultCities: string;
  defaultZipCodes: string;
  defaultSegments: string;
} | null | undefined): MarketIqReportScopeSelection {
  if (!preference) return defaultMarketIqScopeSelection();
  return normalizeMarketIqScopeSelection({
    cities: stringArray(preference.defaultCities),
    zipCodes: stringArray(preference.defaultZipCodes),
    segments: stringArray(preference.defaultSegments) as MarketIqReportScopeSelection["segments"] | undefined,
  });
}
