import {
  defaultMarketIqScopeSelection,
  normalizeMarketIqScopeSelection,
  normalizeMarketIqScopeSelectionForSnapshot,
  type MarketIqReportScopeSelection,
} from "@/lib/market-iq/report/scope";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";

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
  defaultCities?: string;
  defaultZipCodes?: string;
  defaultSegments?: string;
  cities?: string;
  zipCodes?: string;
  segments?: string;
} | null | undefined, snapshot?: MarketIqReportSnapshot): MarketIqReportScopeSelection {
  if (!preference) return snapshot
    ? normalizeMarketIqScopeSelectionForSnapshot({}, snapshot)
    : defaultMarketIqScopeSelection();
  const input = {
    cities: stringArray(preference.cities ?? preference.defaultCities),
    zipCodes: stringArray(preference.zipCodes ?? preference.defaultZipCodes),
    segments: stringArray(preference.segments ?? preference.defaultSegments) as MarketIqReportScopeSelection["segments"] | undefined,
  };
  return snapshot
    ? normalizeMarketIqScopeSelectionForSnapshot(input, snapshot)
    : normalizeMarketIqScopeSelection(input);
}
