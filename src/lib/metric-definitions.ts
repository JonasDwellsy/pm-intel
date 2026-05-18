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
  | "pricingTier";

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
    methodologyHref: "/methodology#dom",
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
    methodologyHref: "/methodology#vacancy-signal",
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
    methodologyHref: "/methodology#rent-stability",
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
    methodologyHref: "/methodology#operator-stability",
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
    methodologyHref: "/methodology#geographic-concentration",
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
    methodologyHref: "/methodology#pricing-tier",
  },
};
