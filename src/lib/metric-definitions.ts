// Metric definitions consumed by the v1.0 scorecard "i" icon modals (Layer 6B,
// per Scorecard_Design_Spec_v1.0.md Section 3). Centralized so every modal
// across Layers 1-5 reads from the same dictionary — readers learn the modal
// pattern once and the methodology link goes to one consistent destination.
//
// Sourced from:
//   - Methodology_v0.6_Spec.md (DOM, Tenancy, Marketing core formulas)
//   - Methodology_v0.6.1_Patches.md (Community Visibility ratio, Rent
//     Performance YoY delta)
//   - Methodology_v0.6.2_Patches.md (star system, multi-level percentile,
//     Rent Stability volatility, Geographic Concentration top-3 share)

export interface MetricDefinition {
  /** Header — large, navy heading at the top of the modal. */
  name: string;
  /** Plain-language 1-2 sentence definition. */
  definition: string;
  /** Optional formula — rendered as a mono code block. */
  formula?: string;
  /** Optional variable definitions for the formula. */
  variableDefs?: Array<{ symbol: string; meaning: string }>;
  /** What cohort the metric is compared against. */
  cohortScope: string;
  /** Metric-specific caveats. */
  caveats: string[];
  /** Destination anchor on the methodology page (e.g., "#dom"). */
  methodologyHref?: string;
}

export type MetricKey =
  // Per-metric definitions (wired in Layers 2-4 tile/card "i" icons).
  | "composite"
  | "quadrant7Cell"
  | "dom"
  | "tenancy"
  | "rentPerformance"
  | "marketing"
  | "communityVisibility"
  | "vacancySignal"
  | "rentStability"
  | "operatorStability"
  | "geographicConcentration"
  | "pricingTier"
  // Section-level definitions (wired on Layer eyebrows + subsection headers).
  | "section-executive-summary"
  | "section-distinguishing-characteristics"
  | "section-performance-dimensions"
  | "section-lending-signals"
  | "section-portfolio"
  | "section-geographic-spread"
  | "section-cross-market-presence"
  | "section-portfolio-composition";

export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  composite: {
    name: "Composite Score",
    definition:
      "Weighted composite of the five performance dimensions. Star reflects the operator's quartile position within the cohort selected at seed time.",
    formula:
      "composite = 0.30·DOM_pct + 0.30·Tenancy_pct + 0.10·RentPerf_pct + 0.15·Marketing_pct + 0.15·CommVis_pct",
    variableDefs: [
      { symbol: "*_pct", meaning: "percentile rank of the operator on each metric within cohort" },
      { symbol: "CommVis_pct", meaning: "redistributed to other weights when Community Visibility is suppressed (Scattered, Hybrid below gate, MF/BTR under tenure)" },
    ],
    cohortScope:
      "Primary cohort (same MSA + same 7-cell quadrant) if N≥10; else fallback (same MSA + same operator type); else MSA-wide.",
    caveats: [
      "Composite is descriptive, not predictive. It summarizes observable operator behavior; it doesn't forecast lender risk or investment return.",
      "Weights are unchanged from v0.6.1.",
    ],
    methodologyHref: "/methodology#composite",
  },

  quadrant7Cell: {
    name: "7-Cell Operator Classification",
    definition:
      "Taxonomy combining asset scope (SFR / Small MF/BTR / Large MF/BTR / Hybrid) with scale (Independent / Institutional). Refines the v0.6.1 5-cell taxonomy by splitting MF/BTR by median community size.",
    formula:
      "concentrated_share = Σ urus in 10+ unit communities / total urus\nif < 30% → SFR\nif ≥ 70% AND median community ≥ 50 → Large MF/BTR\nif ≥ 70% AND median community 10-49 → Small MF/BTR\nelse → Hybrid",
    variableDefs: [
      { symbol: "concentrated_share", meaning: "fraction of observed units in communities with ≥10 PM-managed units" },
      { symbol: "median community size", meaning: "median of PM-managed unit counts across concentrated communities" },
    ],
    cohortScope:
      "Classification is per-operator-per-MSA; scale axis (Independent / Institutional) uses cross-market urus aggregation.",
    caveats: [
      "Reflects observed community concentration, not self-reported business model.",
      "Operators near the 30% or 70% thresholds may reclassify between data refreshes if their portfolio mix shifts.",
    ],
    methodologyHref: "/methodology#classification",
  },

  dom: {
    name: "Lease-up Performance · DOM",
    definition:
      "Median days a listing sits on the platform between activation and lease over the trailing 12 months. Lower is more favorable.",
    formula: "DOM_T12 = median(lease_date − activated_date) for listings where lease_date ∈ T12",
    cohortScope:
      "Primary (same MSA + same 7-cell quadrant) if N≥10; else fallback (same operator type, any scale); else MSA.",
    caveats: [
      "Listings without a recorded lease close are excluded.",
      "DOM is sensitive to portfolio mix — operators with more entry-level inventory typically lease faster than premium-tier portfolios; the cohort comparison controls for this only to the extent the cohort shares mix.",
    ],
    methodologyHref: "/methodology#composite",
  },

  tenancy: {
    name: "Tenant Retention",
    definition:
      "Median months between successive listings of the same unit — proxies for how long the average tenant stays in place. Higher is more favorable.",
    formula:
      "tenancy_months = median(next_listing_date − prior_close_date) for unit-pairs in T12",
    cohortScope:
      "Same MSA + asset type (apartment / house) cohort. Primary 7-cell cohort applies for star assignment when N≥10.",
    caveats: [
      "Episode-clustered methodology — multi-episode units (same unit listed 2+ times) are the analysis pool.",
      "Right-censored for operators with shorter observation history. When yearsVisible < 3 a caveat surfaces; Kaplan-Meier correction is a v0.7 item.",
      "Operators with low multi-episode units (mostly first-time listings) have noisy estimates.",
    ],
    methodologyHref: "/methodology#tenancy",
  },

  rentPerformance: {
    name: "Rent Performance",
    definition:
      "Operator's mix-adjusted YoY rent change vs the cohort median for the same period. Surfaces relative rent growth — positive delta means above-cohort growth. Composite-feeding signal.",
    formula:
      "delta = pm_YoY − cohort_median_YoY\nstate: positive if delta > 0.5pp; negative if delta < −0.5pp; neutral otherwise",
    variableDefs: [
      { symbol: "pm_YoY", meaning: "operator's mix-adjusted median rent, latest quarter / same quarter prior year" },
      { symbol: "cohort_median_YoY", meaning: "MSA cohort's median YoY mix-adjusted rent change" },
    ],
    cohortScope:
      "MSA-wide for cohort median (uniform across operator types in v0.6.1). Star uses cohort selection per Patch 3.",
    caveats: [
      "Mix-adjusted — controls for changes in bedroom-mix between periods, not for changes in tier, vintage, or geographic mix.",
      "Operators with limited rent history default to lower percentiles regardless of true posture.",
    ],
    methodologyHref: "/methodology#rent-performance",
  },

  marketing: {
    name: "Operational Discipline",
    definition:
      "Composite of listing completeness, amenity disclosure, description depth, and photo coverage. A proxy for operational rigor on the listing side. Higher is more favorable.",
    formula:
      "marketing = 0.35·completeness + 0.25·amenities + 0.20·description + 0.20·photos\n(each subscore 0-100, composite 0-100)",
    cohortScope:
      "Primary 7-cell cohort if N≥10; else fallback operator type; else MSA.",
    caveats: [
      "Measures listing-side discipline only. Operators with a stronger brand may invest less in listing marketing on platforms like Dwellsy and still operate well.",
      "Photo coverage and description length are dimension-floor checks, not quality assessments.",
    ],
    methodologyHref: "/methodology#marketing",
  },

  communityVisibility: {
    name: "Inventory Transparency",
    definition:
      "Ratio of observed listings to expected listings given known community sizes and a default 20% annual turnover assumption. Higher means we observe more of the operator's MF/BTR inventory.",
    formula:
      "ratio = observed_listings_T12 / Σ(known_community_size × 0.20)\ncomprehensive: ratio ≥ 0.85; likely-partial: 0.50-0.85; partial: < 0.50",
    variableDefs: [
      { symbol: "known_community_size", meaning: "top-down PM-managed unit count for concentrated communities" },
      { symbol: "0.20", meaning: "default annual turnover rate (industry average; adjustable per operator when claimed data exists)" },
    ],
    cohortScope:
      "MF/BTR scope-gate qualifying operators only. Scattered, Hybrid below gate, and MF/BTR with insufficient tenure suppress this metric.",
    caveats: [
      "20% turnover is a population assumption — actual turnover varies by tier and market.",
      "Operators with mid-period community size changes (acquisitions, dispositions) can flag as partial even when fully visible.",
      "Comprehensive doesn't mean complete — it means observable listings are consistent with industry-default turnover at the known community size.",
    ],
    methodologyHref: "/methodology#community-visibility",
  },

  vacancySignal: {
    name: "Vacancy Signal",
    definition:
      "Fraction of the average leasing cycle spent vacant. Composite of DOM (vacancy duration) and tenancy (occupancy duration). Lower is more favorable.",
    formula: "vacancy_pct = (DOM_days / 30) / (Tenancy_months + DOM_days / 30) × 100",
    cohortScope:
      "Same primary→fallback→MSA waterfall as DOM and Tenancy individually.",
    caveats: [
      "Combines two metrics with their own caveats. Operators with short observation history will have noisy Tenancy → noisy vacancy.",
      "Doesn't account for intentional vacancy (renovation, hold-for-sale).",
    ],
    methodologyHref: "/methodology#lending-signals",
  },

  rentStability: {
    name: "Rent Stability",
    definition:
      "Standard deviation of trailing 12 quarters' YoY rent change in percentage points. Lower means more consistent rent posture. Suppressed for operators with under 12 quarters of observation history.",
    formula:
      "volatility_pp = stdev(YoY_q5..q12) × 100\nrequires 12 quarters of mix-adjusted median data",
    cohortScope:
      "Cohort median volatility is computed across operators with qualifying history within the operator's primary cohort.",
    caveats: [
      "Currently computed from the 6-quarter rentTrajectory in v0.6.2 seed — this over-suppresses operators with 3-5 years of underlying listings. v0.7 fix: compute from raw listings over 12 quarters per Patch 4.",
      "Volatility doesn't separate intentional rent strategy from market-driven volatility.",
    ],
    methodologyHref: "/methodology#lending-signals",
  },

  operatorStability: {
    name: "Operator Stability",
    definition:
      "Composite of observation tenure (years visible in Dwellsy IQ data) and cross-market presence (count of covered markets where operator surfaces). Higher tenure and broader footprint = more favorable.",
    formula:
      "stability = f(years_visible, market_count, persistent_eligibility)\nv0.6.2 surfaces years_visible + market_count factually; persistent_eligibility deferred to v0.7",
    cohortScope:
      "Same primary→fallback→MSA waterfall on yearsVisible percentile.",
    caveats: [
      "Persistent-eligibility-across-last-8-windows component is not in v0.6.2 — surfacing in v0.7 will tighten the composite.",
      "Cross-market footprint depends on the markets currently covered (7 MSAs as of v0.6.2). National operators in non-covered markets aren't reflected.",
    ],
    methodologyHref: "/methodology#lending-signals",
  },

  geographicConcentration: {
    name: "Geographic Concentration",
    definition:
      "Share of observed units in the operator's top 3 cities by unit count. Descriptive only — concentration is neither inherently favorable nor unfavorable.",
    formula:
      "top_3_share = Σ urus in top 3 cities / total observed urus\nlinear_position: more_concentrated | near_cohort | more_dispersed",
    cohortScope:
      "Cohort median top-3 share computed at seed time at primary, fallback, or MSA level (whichever applies per Patch 7).",
    caveats: [
      "No star assigned per Decision G.4 — concentration is descriptive, not evaluative.",
      "Some lenders prefer concentration (operator efficiency); others prefer dispersion (geographic risk diversification). The signal supports either reading.",
    ],
    methodologyHref: "/methodology#lending-signals",
  },

  pricingTier: {
    name: "Pricing Tier",
    definition:
      "Operator's latest observed mix-adjusted median rent positioned within the MSA rent distribution. Premium (≥75th percentile) / Mid-market (25th-75th) / Value (<25th). Positional label, not evaluative.",
    formula: "tier = bucket(pm_latest_median, msa_median_distribution_percentile)",
    cohortScope:
      "MSA-wide median rent distribution across all operators with observable rent data.",
    caveats: [
      "Mix-adjusted, not BR-bucketed. BR-specific positioning (e.g., where a PM's 2BR sits in the MSA 2BR distribution) is a v0.7 item.",
      "Tier labels are descriptive — Premium isn't 'better' than Value; they reflect different positioning strategies.",
    ],
    methodologyHref: "/methodology#lending-signals",
  },

  // --- Section-level definitions ---

  "section-executive-summary": {
    name: "Executive Summary",
    definition:
      "Three-sentence prose paragraph synthesizing the operator's identity, cohort position, and one distinguishing observation. Pre-computed at seed time from deterministic templates and validated against the operator-dignity language gate.",
    cohortScope:
      "Sentence 2 references whichever cohort was used for composite star (primary 7-cell / fallback operator type / MSA).",
    caveats: [
      "Templates are deterministic — same operator inputs produce the same prose across data refreshes.",
      "Forbidden tokens (weak, poor, strong, excellent, underperforming, manages X) are validated out at seed time.",
    ],
    methodologyHref: "/methodology#composite",
  },

  "section-distinguishing-characteristics": {
    name: "Distinguishing Characteristics",
    definition:
      "Two to four bullet observations capturing what's structurally distinctive about the operator. Selected from a priority-ranked candidate set: cross-market presence, scale extremes, geographic patterns, tenure observations, eligibility breadth.",
    cohortScope:
      "Observations reference the operator's primary 7-cell cohort where relevant; fallback to MSA when the primary cohort is too small.",
    caveats: [
      "Suppressed when fewer than two qualifying observations exist.",
      "Observation candidates are scored by distinctiveness, not by favorability.",
    ],
    methodologyHref: "/methodology#composite",
  },

  "section-performance-dimensions": {
    name: "Performance Dimensions",
    definition:
      "Five performance dimensions (four for SFR/Hybrid) — Lease-up Performance, Tenant Retention, Rent Performance, Operational Discipline, Inventory Transparency — each with cohort-aware star, distribution chart, and inline peer comparison table.",
    cohortScope:
      "Each metric independently follows the primary→fallback→MSA waterfall (N≥10 threshold). Cohorts can differ across metrics for the same operator.",
    caveats: [
      "Peer rows show their star within the focal operator's selected cohort — internally consistent for the table, may differ from a peer's own primary-cohort star.",
      "Cards render 'Insufficient data' when the focal metric is null rather than suppressing the card entirely.",
    ],
    methodologyHref: "/methodology#composite",
  },

  "section-lending-signals": {
    name: "Lending Signals",
    definition:
      "Five underwriting-relevant synthesis signals. Two are pre-computed (Rent Stability, Geographic Concentration); three are derived at render time (Vacancy Signal, Operator Stability, Pricing Tier).",
    cohortScope:
      "Per-signal cohort selection follows the same primary→fallback→MSA waterfall as Layer 3 metrics.",
    caveats: [
      "Geographic Concentration is descriptive only (no star) per Decision G.4 — concentration is neither inherently favorable nor unfavorable.",
      "Pricing Tier (Premium / Mid-market / Value) is a positional label, not an evaluative one.",
      "Operator Stability surfaces yearsVisible + market count; persistent-eligibility-per-window component is deferred to v0.7.",
    ],
    methodologyHref: "/methodology#lending-signals",
  },

  "section-portfolio": {
    name: "Portfolio Characteristics",
    definition:
      "Six subsections describing the operator's footprint: coverage map with narrative, geographic spread, cross-market presence, portfolio composition, rent trajectory descriptive overlay, and pricing data snapshot. Each subsection renders only when relevant data is present.",
    cohortScope:
      "Geographic and cross-market sections are operator-specific. Rent trajectory overlay uses the same cohort selection as Layer 3 Rent Performance.",
    caveats: [
      "Cross-Market Presence renders only for operators visible in 2+ markets.",
      "BR-mix portfolio composition and BR-bucketed pricing data are deferred to v0.7 — current v0.6.2 surfaces house/apartment split where applicable.",
      "Per-city unit estimates are derived from top-cities percentage × total observed urus; marked with `~` to signal derivation.",
    ],
    methodologyHref: "/methodology#community-visibility",
  },

  "section-geographic-spread": {
    name: "Geographic Spread Analysis",
    definition:
      "Top observed submarkets bar list with per-city share and estimated unit counts, plus a concentration summary (top-3 city share, distinct cities observed). SFR-prominent — geographic spread carries more decision weight for scattered operators than for MF/BTR.",
    cohortScope:
      "Operator-specific; cohort context is provided in the separate Lending Signal 4 (Geographic Concentration) card.",
    caveats: [
      "Per-city urus counts are estimates (top-cities pct × total). Direct per-city counts are a v0.7 pipeline item.",
      "Top-3 share is descriptive; concentration is neither inherently favorable nor unfavorable.",
    ],
    methodologyHref: "/methodology#community-visibility",
  },

  "section-cross-market-presence": {
    name: "Cross-Market Presence",
    definition:
      "Per-MSA breakdown for operators observed in 2+ of our covered markets. Each row shows market name, observed urus T12 in that market, composite star, and cohort qualifier reflecting whichever cohort that market's seed selected.",
    cohortScope:
      "Each row's cohort is the focal operator's selected cohort within that specific MSA — primary 7-cell if N≥10, else fallback, else MSA.",
    caveats: [
      "Cross-market join is by exact operator name match. Two unrelated operators sharing a name could erroneously merge; operator-identity reconciliation is a v0.7 pipeline item.",
      "Suppressed for single-market operators.",
    ],
    methodologyHref: "/methodology#classification",
  },

  "section-portfolio-composition": {
    name: "Portfolio Composition",
    definition:
      "Observed scale and mix: observed units T12, active listings, observed concentrated community count, average community size, and (for SFR + Hybrid operators with both-type visibility) house vs apartment urus split.",
    cohortScope:
      "Operator-specific. No cohort comparison at this level — cohort context for individual metrics is surfaced in their respective Layer 3 cards.",
    caveats: [
      "Bedroom mix (1BR / 2BR / 3BR+) is not in the v0.6.2 seed. BR-bucketed composition is a v0.7 pipeline item.",
      "Average community size uses the top-down PM-managed unit count from concentrated communities, not the full community size.",
    ],
    methodologyHref: "/methodology#community-visibility",
  },
};
