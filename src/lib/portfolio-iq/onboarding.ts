export interface OnboardingPropertyDraft {
  propertyName: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  unitCount: number | null;
  assetType: string | null;
  sourceKind: "manual" | "spreadsheet";
}

export function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function parseManualPropertyLines(value: string): OnboardingPropertyDraft[] {
  const seen = new Set<string>();
  return value.split(/\r?\n/).flatMap((line) => {
    const addressLine = line.trim().replace(/^[-•]\s*/, "");
    const key = addressLine.toLowerCase();
    if (!addressLine || seen.has(key)) return [];
    seen.add(key);
    return [{ propertyName: null, addressLine, city: null, state: null, postalCode: null, unitCount: null, assetType: null, sourceKind: "manual" as const }];
  });
}

function cell(row: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function parseSpreadsheetRows(rows: Array<Record<string, unknown>>): OnboardingPropertyDraft[] {
  const seen = new Set<string>();
  return rows.flatMap((raw) => {
    const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]));
    const address = cell(row, ["address", "street_address", "address_1", "property_address"]);
    if (!address) return [];
    const city = cell(row, ["city", "address_city"]);
    const state = cell(row, ["state", "address_state"]);
    const postalCode = cell(row, ["zip", "zipcode", "zip_code", "postal_code"]);
    const addressLine = [address, city, state, postalCode].filter(Boolean).join(", ");
    const key = addressLine.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    const units = Number(cell(row, ["units", "unit_count", "number_of_units"]));
    return [{
      propertyName: cell(row, ["property_name", "name", "community_name"]) || null,
      addressLine,
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
      unitCount: Number.isInteger(units) && units > 0 ? units : null,
      assetType: cell(row, ["property_type", "asset_type", "type"]) || null,
      sourceKind: "spreadsheet" as const,
    }];
  });
}

export function onboardingStatusLabel(status: string | null | undefined): string {
  return ({
    started: "Getting started",
    intake_received: "Portfolio received",
    call_requested: "Session requested",
    scheduled: "Session scheduled",
    activating: "Dwellsy is activating",
    launch_ready: "Ready for launch review",
    complete: "Onboarding complete",
  } as Record<string, string>)[status ?? "started"] ?? "Getting started";
}

export function normalizeOnboardingAssetType(value: string | null | undefined): "multifamily" | "single_family" {
  const normalized = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return ["single_family", "singlefamily", "sfr", "house", "home"].includes(normalized)
    ? "single_family"
    : "multifamily";
}

export function onboardingAssetSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "portfolio-property";
}

export function activationTaskTypes(input: {
  matched: boolean;
  hasObservedOperator: boolean;
}): Array<"match_review" | "issue_uru" | "operator_outreach" | "comp_setup" | "customer_confirmation"> {
  return [
    ...(!input.matched ? ["match_review" as const] : []),
    "issue_uru" as const,
    ...(!input.hasObservedOperator ? ["operator_outreach" as const] : []),
    "comp_setup" as const,
    "customer_confirmation" as const,
  ];
}
