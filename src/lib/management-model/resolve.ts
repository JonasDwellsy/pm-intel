// v0.26 — Management-model resolver. Pure functions that turn an operator's
// listing structure + an optional website-content verdict into a single
// hire-framed flag: third-party (likely hireable) / owner-operator (likely) /
// unknown, with an orthogonal confidence chip and a one-line basis.
//
// Kept structural (no ScorecardData import) so types.ts can import the
// ManagementModel type from here without a cycle. Resolved at SEED time
// (prisma/seed.ts) and baked onto the scorecard blob so scorecard, watch-list,
// and CSV all read one field. Website verdicts come from
// src/data/management_model_website.json, produced by
// scripts/data-pipeline/classify_management_website.py.

export type ManagementModelKind = "third_party" | "owner_operator" | "unknown";
export type ManagementConfidence = "high" | "medium" | "low";

export interface ManagementModel {
  model: ManagementModelKind;
  confidence: ManagementConfidence | null; // null iff model === "unknown"
  basis: string;
  source: "listing" | "website" | "listing+website";
}

/** One entry of management_model_website.json. */
export interface WebsiteVerdict {
  verdict: "third_party" | "owner_operator" | "inconclusive";
  confidence: ManagementConfidence | null;
  matched?: string[];
  url?: string;
  error?: string;
}

export const MANAGEMENT_MODEL_LABELS: Record<ManagementModelKind, string> = {
  third_party: "Third-party manager",
  owner_operator: "Owner-operator (likely)",
  unknown: "Unknown",
};

export function managementModelLabel(
  model: ManagementModelKind | null | undefined
): string | null {
  return model ? MANAGEMENT_MODEL_LABELS[model] : null;
}

// Tunable knobs (single source).
const SCATTERED_MIN = 3;
const BREADTH_COMMUNITIES = 8;
const BREADTH_SUBMARKETS = 4;
const CONCENTRATED_COMMUNITIES = 3;
const CONCENTRATED_SUBMARKETS = 2;

const CONF_RANK: Record<ManagementConfidence, number> = { high: 3, medium: 2, low: 1 };
const rank = (c: ManagementConfidence | null): number => (c ? CONF_RANK[c] : 0);

export interface ListingSignal {
  quadrant7Cell: string | null;
  communities: number;
  scatteredHomes: number;
  submarkets: number;
}

interface Verdict {
  model: ManagementModelKind;
  confidence: ManagementConfidence | null;
  basis: string;
}

interface PropLike { kind?: string | null; homes?: number | null; submarket?: string | null }

export function listingSignal(input: {
  quadrant7Cell?: string | null;
  properties?: PropLike[] | null;
}): ListingSignal {
  const props = input.properties ?? [];
  const communities = props.filter((p) => p.kind === "community").length;
  const scatteredHomes = props
    .filter((p) => p.kind === "sfr-submarket")
    .reduce((s, p) => s + (p.homes ?? 0), 0);
  const submarkets = new Set(props.map((p) => p.submarket).filter(Boolean)).size;
  return { quadrant7Cell: input.quadrant7Cell ?? null, communities, scatteredHomes, submarkets };
}

export function listingVerdict(s: ListingSignal): Verdict {
  const q7 = s.quadrant7Cell ?? "";
  if (q7 === "SFR Independent")
    return { model: "third_party", confidence: "high",
      basis: "Independent scattered single-family operator — management-for-owners by nature." };
  if (q7 === "SFR Institutional")
    return { model: "owner_operator", confidence: "medium",
      basis: "Institutional single-family operator; typically owns its homes (may also manage third-party)." };

  if (q7.includes("MF/BTR")) {
    // Mixed book (apartment communities + scattered homes) is a strong
    // third-party tell an owning REIT never produces — check it first.
    if (s.communities >= 1 && s.scatteredHomes >= SCATTERED_MIN)
      return { model: "third_party", confidence: "medium",
        basis: "Manages both apartment communities and scattered homes — a pattern typical of third-party management." };
    // Institutional apartment operators resolve to Unknown BEFORE the
    // broad-footprint heuristic: at scale an owning REIT and a large
    // third-party manager both have wide, multi-submarket footprints, so
    // breadth alone can't separate them (it was mislabeling REIT owners like
    // UDR third-party/low). A confident website verdict still overrides this.
    if (q7.includes("Institutional"))
      return { model: "unknown", confidence: null,
        basis: "Institutional apartment operator — could be an owning REIT or a large third-party manager; both common at this scale. Verify directly." };
    if (s.communities >= BREADTH_COMMUNITIES && s.submarkets >= BREADTH_SUBMARKETS)
      return { model: "third_party", confidence: "low",
        basis: "Broad, multi-submarket apartment portfolio; listings can't confirm ownership vs. management." };
    if (s.communities > 0 && s.communities <= CONCENTRATED_COMMUNITIES && s.submarkets <= CONCENTRATED_SUBMARKETS)
      return { model: "owner_operator", confidence: "low",
        basis: "Small, concentrated apartment footprint; may be an owner. Listings can't confirm." };
  }
  if (q7 === "Hybrid")
    return { model: "third_party", confidence: "low",
      basis: "Operates across property types — a pattern common to third-party managers, but unconfirmed." };

  return { model: "unknown", confidence: null,
    basis: "Listing data can't distinguish third-party management from ownership. Verify directly." };
}

export function combine(listing: Verdict, website?: WebsiteVerdict | null): ManagementModel {
  const w = website && website.verdict !== "inconclusive" && website.confidence != null ? website : null;
  if (!w) return { ...listing, source: "listing" };

  const wModel = w.verdict as ManagementModelKind; // third_party | owner_operator
  const wBasis = wModel === "third_party"
    ? "Website markets property-management services to owners."
    : "Website presents an owned/managed portfolio with no third-party management offering.";

  if (wModel === listing.model) {
    const conf = rank(w.confidence) >= rank(listing.confidence) ? w.confidence : listing.confidence;
    return { model: listing.model, confidence: conf,
      basis: `${listing.basis} Corroborated by the operator's website.`, source: "listing+website" };
  }
  if (rank(w.confidence) >= rank(listing.confidence))
    return { model: wModel, confidence: w.confidence, basis: wBasis, source: "website" };
  return { ...listing, source: "listing" };
}

export function resolveManagementModel(
  listing: { quadrant7Cell?: string | null; properties?: PropLike[] | null },
  website?: WebsiteVerdict | null
): ManagementModel {
  return combine(listingVerdict(listingSignal(listing)), website);
}
