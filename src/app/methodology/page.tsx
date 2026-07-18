import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { QuadrantGrid } from "@/components/scorecard/QuadrantGrid";
import { SectionAnchor } from "@/components/methodology/SectionAnchor";
import { FormulaBlock, Op } from "@/components/methodology/FormulaBlock";
import {
  GlossaryTable,
  type GlossaryRow,
} from "@/components/methodology/GlossaryTable";
import {
  MethodologyTOC,
  type TocItem,
} from "@/components/methodology/MethodologyTOC";
import { MethodologyMobileJump } from "@/components/methodology/MethodologyMobileJump";
import { TrackEvent } from "@/components/analytics/TrackEvent";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Operator IQ scores property managers (methodology v0.7): inclusion and category exclusions, URU resolution, the 7-cell operator taxonomy with the apartment-dominant override, community visibility, days-on-market and Kaplan-Meier tenant retention, rent trajectory and performance, marketing discipline, the internal composite and per-metric star system, canonical and within-market operator identity, portfolio-size estimation, and honest limitations.",
};

async function loadVersion() {
  const sample = await prisma.pM.findFirst({
    select: { methodologyVersion: true, dataAsOf: true },
    orderBy: { dataAsOf: "desc" },
  });
  // Design version isn't stored as a column; v2.0 is the redesigned
  // scorecard (the earlier Classic layout has been retired), and it is
  // referenced together with methodology v0.7 in every modal.
  const designVersion = "v2.0";
  const markets = await prisma.market.findMany({
    select: { city: true },
    orderBy: { city: "asc" },
  });
  const marketCount = markets.length;
  const marketList = markets.map((m) => m.city).join(" · ");
  return sample
    ? {
        version: sample.methodologyVersion,
        designVersion,
        dataAsOf: sample.dataAsOf.toISOString().slice(0, 10),
        marketCount,
        marketList,
      }
    : {
        version: "v0.7",
        designVersion,
        dataAsOf: "2026-07-06",
        marketCount,
        marketList,
      };
}

// Methodology page TOC — 12 numbered sub-sections per spec Section 11 +
// Patch 5. Anchor IDs are kept short and stable across versions; existing
// inbound links from scorecards (e.g. #classification, #tenancy) continue to
// resolve.
const TOC: TocItem[] = [
  { id: "inclusion", num: "01", label: "Inclusion criteria" },
  { id: "uru", num: "02", label: "Unit identity (URU)" },
  { id: "classification", num: "03", label: "Operator classification" },
  { id: "community-visibility", num: "04", label: "Community visibility" },
  { id: "tenancy", num: "05", label: "DOM & Tenant Retention" },
  { id: "rent-trajectory", num: "06", label: "Rent trajectory" },
  { id: "rent-performance", num: "07", label: "Rent performance" },
  { id: "marketing", num: "08", label: "Marketing scores" },
  { id: "composite", num: "09", label: "Composite & stars" },
  { id: "limitations", num: "10", label: "Honest limitations" },
  { id: "glossary", num: "11", label: "Glossary" },
  { id: "versioning", num: "12", label: "Version history" },
];

const GLOSSARY: GlossaryRow[] = [
  {
    term: "URU",
    definition:
      "Unique Rentable Unit — Dwellsy's unit-identity framework, resolving a listing through the address → unit → room → bed hierarchy.",
    ref: "§02",
  },
  {
    term: "Community",
    definition:
      "A multi-unit grouping defined upstream by Dwellsy. May be a single building, a multi-building MF community, a BTR development, or a condo development.",
    ref: "§03, §04",
  },
  {
    term: "Trailing 12 months (T12)",
    definition:
      "Observation window anchored to the data refresh date. A listing falls in T12 if creation or deactivation occurred in the window, or if the listing is still active.",
    ref: "§01",
  },
  {
    term: "Concentrated community",
    definition:
      "A community where the operator manages 10 or more distinct units within this PM.",
    ref: "§03, §04",
  },
  {
    term: "MSA cohort",
    definition:
      "The set of eligible PMs within the same MSA used as the comparison group for percentile ranks.",
    ref: "§09",
  },
  {
    term: "Composite",
    definition:
      "The weighted percentile-rank average across DOM, Tenant Retention, Rent Performance, Marketing, and (when applicable) Community Visibility. Computed internally and versioned, but never surfaced as a score or a rank on scorecards — its only visible effect is as the final tie-break in star-ordered market lists.",
    ref: "§09",
  },
  {
    term: "Scope gate",
    definition:
      "The three-condition test (≥30 units in ≥1 community, ≥50% concentrated, ≥12 months tenure) that controls whether Community Visibility is computed for an operator.",
    ref: "§04",
  },
  {
    term: "7-cell taxonomy",
    definition:
      "The v0.6.2 operator classification: SFR / Small MF/BTR / Large MF/BTR / Hybrid on the type axis, crossed with Independent / Institutional on the scale axis (Hybrid is single-cell, no scale split). Replaces the v0.6.1 5-cell taxonomy by splitting MF/BTR by median community size (10-49 = Small, ≥50 = Large).",
    ref: "§03",
  },
  {
    term: "Concentrated share",
    definition:
      "Fraction of an operator's observed urus that sit in communities where they manage 10 or more units. Drives the SFR / MF/BTR / Hybrid split (< 30% / ≥ 70% / in between) — but only for operators that are not apartment-dominant; the apartment-dominant override (house share ≤ 10%) is applied first.",
    ref: "§03",
  },
  {
    term: "Gold / Silver / No star",
    definition:
      "Quartile labels assigned per metric per PM. Gold = top quartile (≥75th percentile) of the applicable cohort; Silver = above-median (50-75th); No star = below median. Replaces percentile-rank tier labels from earlier versions.",
    ref: "§09",
  },
  {
    term: "Primary / Fallback / MSA cohort",
    definition:
      "Three cohort levels used for star assignment per metric. Primary = same MSA + same 7-cell quadrant; Fallback = same MSA + same operator type (any scale); MSA = all eligible operators in the MSA. The applicable level is selected by N≥10 waterfall.",
    ref: "§09",
  },
  {
    term: "Years visible",
    definition:
      "Length of operator observation history in Operator IQ data, measured from the first observed listing. Surfaced as operator-tenure context; it no longer gates the retention metric, which now uses a Kaplan-Meier survival estimate with its own qualification test.",
    ref: "§05",
  },
  {
    term: "Mix-adjusted median rent",
    definition:
      "Quarterly median rent computed within bedroom buckets and averaged using the operator's bedroom mix as weights. Controls for compositional differences across operators; underlies both Rent Trajectory (§06) and Rent Performance (§07).",
    ref: "§06, §07",
  },
  {
    term: "Observed vs portfolio",
    definition:
      "Every unit-count figure on a scorecard is qualified as observed in Dwellsy listings, not as the operator's full portfolio. urusT12 (distinct units observed listing in T12), observedCommunities, and observedCommunityTotalUnits are seeded as distinct fields so templates can phrase precisely.",
    ref: "§10",
  },
  {
    term: "Lending Signals",
    definition:
      "Underwriting-relevant context signals. Vacancy has been retired. The three survivors — Operator Stability, Geographic Concentration, Pricing Tier — are folded into the scorecard's Scale & Fit section on the web (no longer a standalone section) and still render as a dedicated page in the PDF export. None feed the composite.",
    ref: "§09",
  },
  // ── v0.6.3 terms ──────────────────────────────────────────────────
  {
    term: "Active operator",
    definition:
      "An operator with ≥3 listings observed in the trailing 12 months. Replaces the legacy total-operator denominator as the surfaced headline figure on market pages (v0.6.3 Patch 1). Distinct from eligible — active is a presence threshold; eligible is the ranking threshold.",
    ref: "§01",
  },
  {
    term: "Eligible for ranking",
    definition:
      "An operator with ≥30 listings observed in the trailing 12 months. Operators below this threshold appear in the universe (tracked) tier but don't receive a composite rank or per-metric stars. Window labeled T12 throughout the product (v0.6.3 Patch 2 corrected an earlier T6M label drift).",
    ref: "§01",
  },
  {
    term: "Market rent growth (T12)",
    definition:
      "Median operator-level YoY rent change across the ranked cohort in a market, surfaced on the Market Snapshot tile (v0.6.3 Patch 3). Displayed alongside a national-benchmark line and a pre-computed pp delta vs national.",
    ref: "§07",
  },
  {
    term: "National benchmark",
    definition:
      "Reference value computed once across every continuing operator in every covered MSA. Used as the comparison line on market rent growth tiles and on the share-trajectory surface. Single value across markets — embedded per-market in the seed for render simplicity.",
    ref: "§07",
  },
  {
    term: "Star summary chip",
    definition:
      "★N ☆M chip showing an operator's gold + silver per-metric star counts. Used on market list rows and the scorecard header. Counts roll up across DOM, Rent Performance, Marketing, Tenant Retention, and (when applicable) Community Visibility. Composite star is excluded from the rollup to avoid double-counting.",
    ref: "§09",
  },
  {
    term: "State-level aggregate",
    definition:
      "Cross-MSA operator counts at /property-managers/[state]. Counts deduplicate by canonicalOperatorId (v0.6.4) so a multi-market operator counts once per state. Pool of in-state MSAs powers state-level medians for DOM and rent growth.",
    ref: "§07",
  },
  {
    term: "Continuing operator",
    definition:
      "An operator with ≥30 listings in both T12 and the prior T24→T12 window. Used as the strict-cohort definition for share-trajectory math (v0.6.3 Patch 6). Operators below threshold in either window classify as new-in-coverage or null-baseline and don't surface a share trajectory value.",
    ref: "§07",
  },
  {
    term: "Share trajectory (YoY)",
    definition:
      "Year-over-year change in an operator's share of ranked-cohort listing activity. Pre-computed per market against the continuing cohort. Surfaced as context only — not used in composite ranking and not star-bearing (v0.6.3 Patch 6).",
    ref: "§07",
  },
  {
    term: "New in coverage / null baseline",
    definition:
      "Share-trajectory eligibility labels for operators outside the continuing cohort. Null baseline: no prior-window listings (t24 = 0 or null). New in coverage: prior listings present but below the 30-listing threshold. Both render an explicit status on the scorecard rather than a misleading trajectory number.",
    ref: "§07",
  },
  // ── v0.6.4 terms ──────────────────────────────────────────────────
  {
    term: "Canonical operator identity",
    definition:
      "Operators that appear in multiple markets resolve to a single canonical entity — primarily by Dwellsy's parent-company id (parentCompanyId), which is authoritative, with a human-curated name mapping as the fallback for operators that carry no parent id. Powers the /operators/[canonicalSlug] operator route and state-level count dedup.",
    ref: "§07",
  },
  {
    term: "Cross-market operator",
    definition:
      "An operator whose canonical entity spans ≥2 covered markets. Surfaced via a chip in the scorecard header linking to the cross-market profile. In the current 34-market footprint, 134 multi-market canonical entities cover 413 of 3,649 PM records.",
    ref: "§07",
  },
  {
    term: "Concession activity / concession rate",
    definition:
      "Share of an operator's T12 listings that mention concession language (regex-based classifier on listing descriptions). Surfaced on the scorecard with a listing-weighted market concession rate for cohort context. Context only — not star-bearing, not in the composite. Operators absent from the classifier input show no section.",
    ref: "§07",
  },
  {
    term: "Concession patterns",
    definition:
      "v1 dictionary of ~14 stereotyped pattern families the classifier matches: free month(s), % off, $ off, no/reduced deposit, move-in special, explicit concession, rent reduction, lease special, limited offer, waived fee, free rent, plus an explicit_concession catch-all. Indirect/paraphrased language is missed by design — a v2 LLM-grader pass is a future candidate.",
    ref: "§07",
  },
  // ── v0.7 terms ────────────────────────────────────────────────────
  {
    term: "Apartment-dominant override",
    definition:
      "Classification rule applied before the concentrated-share bands: when an operator's house share (house units ÷ (house + apartment units)) is 10% or less, they are classified MF/BTR regardless of concentrated share, so scattered-apartment operators are no longer mislabeled SFR or Hybrid. Small vs Large still follows median concentrated community size.",
    ref: "§03",
  },
  {
    term: "Tenant retention — S(18)",
    definition:
      "The ranked retention metric: a Kaplan-Meier survival estimate of the share of an operator's tenancies that reach 18 months (\"about X% reach 1.5 years\"). A tenancy is the occupied interval between a listing's deactivation and the same unit's next listing (≥ 3 months); still-occupied units are right-censored. Reported as a percentage, not a duration.",
    ref: "§05",
  },
  {
    term: "Retention qualification / suppression",
    definition:
      "A survival estimate is surfaced only when an operator has ≥ 25 observations reaching 18 months and ≥ 5 turnover events. Below either threshold the metric is suppressed — no value, no star — and the composite is re-normalized across the operator's remaining metrics (the retention weight is redistributed, not scored zero).",
    ref: "§05",
  },
  {
    term: "Departed-operator gate",
    definition:
      "Operators whose most recent listing event (creation or deactivation) is more than 60 days old are treated as departed and dropped from the ranked set entirely, so a wound-down operator's stale data can't distort cohort statistics. Departure is judged at the operator-name level, across a name's id fragments.",
    ref: "§01, §05",
  },
  {
    term: "Category exclusion",
    definition:
      "Two filters that remove non-operators before an operator is formed: a type-based filter (data-platform artifacts — property-management marketing software, listing-syndication services) and a small curated denylist for source-misclassified artifacts. Surfaced read-only in admin tooling.",
    ref: "§01",
  },
  {
    term: "Broker vs. property manager",
    definition:
      "Each operator is typed as a property manager or a broker from the source company-type signal (majority vote, parent type taking precedence). The two are scored in separate cohorts and never pooled; brokers are hidden from the default ranked lists. A small curated override reassigns source-mislabeled operators (e.g. license-holding franchise offices).",
    ref: "§01, §09",
  },
  {
    term: "Within-market fragment merge",
    definition:
      "The data source periodically re-issues an operator new internal ids, splitting one operator into several records in a single market. An exact-tier auto-merge re-pools no-parent records with identical distinctive names (≥2 tokens, ≥1 non-generic, after stripping legal suffixes); placeholder names and a do-not-merge denylist are excluded, invariants are asserted, and a curated merge list wins on conflict.",
    ref: "§07",
  },
  {
    term: "Estimated managed units",
    definition:
      "A portfolio-size estimate from observed on-market turnover, split by unit type: house URUs (T12) × 3.3 + apartment URUs (T12) × 2.6, with the two turnover multipliers admin-tunable. A low–high band brackets it using plausible per-type turnover ranges. Context only — not in the composite. See the portfolio-estimator methodology page.",
    ref: "§10",
  },
];

export default async function MethodologyPage() {
  const { version, designVersion, dataAsOf, marketCount, marketList } =
    await loadVersion();
  const versionLabel = `v${version.replace(/^v/, "")}`;
  const designVersionLabel = `Design ${designVersion}`;
  const dataAsOfLabel = fmtDate(dataAsOf);
  const marketCountLabel = `${marketCount} covered market${marketCount === 1 ? "" : "s"}`;

  return (
    <main className="bg-white">
      {/* v0.17 — methodology_page_viewed. No properties; this surface
          isn't keyed by anything (one canonical methodology page). */}
      <TrackEvent event="methodology_page_viewed" />
      <MethodologyMobileJump items={TOC} />
      {/* === TITLE BLOCK === */}
      <section className="mx-auto max-w-[760px] px-8 pb-8 pt-20 text-center sm:pt-24">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal">
          Methodology Documentation
        </p>
        <h1
          id="page-title"
          className="mt-6 text-balance text-[36px] font-bold leading-[1.1] tracking-[-0.02em] text-navy sm:text-[44px] lg:text-[48px]"
        >
          How we measure property managers.
        </h1>
        <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.55] text-muted-foreground sm:text-[19px]">
          Outside-in performance intelligence on property management
          operators. Methodology <span className="dq-mono">{versionLabel}</span>{" "}
          · {designVersionLabel} · {dataAsOfLabel} · {marketCountLabel}.
        </p>
      </section>

      {/* === META HAIRLINE === */}
      <div className="mx-auto mt-10 max-w-[1080px] px-8">
        <div className="border-t border-teal/55" />
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <p className="dq-mono text-navy">
            {versionLabel}
            <span className="mx-3.5 text-muted-2">·</span>
            {designVersionLabel}
            <span className="mx-3.5 text-muted-2">·</span>
            {dataAsOfLabel}
            <span className="mx-3.5 text-muted-2">·</span>
            {marketList}
          </p>
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal hover:text-teal-700"
          >
            <svg
              aria-hidden
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download PDF
          </a>
        </div>
      </div>

      {/* === DOCUMENT BODY === */}
      <div className="mx-auto max-w-[1320px] px-8 pb-24 pt-16 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-20">
          <article className="min-w-0 space-y-14">
            {/* === SECTION 01 — INCLUSION === */}
            <SectionAnchor
              id="inclusion"
              num="01"
              title="Inclusion criteria."
              lede="How a property manager qualifies for an Operator IQ scorecard."
            >
              <p>
                Every operator in our coverage markets is evaluated against
                two eligibility tests before a scorecard is produced. The
                tests are designed to filter single-rental owners and one-off
                listings while admitting operators with meaningful market
                presence.
              </p>
              <p>A property manager qualifies if both of the following are true:</p>
              <ol>
                <li>
                  <strong>At least 30 listings observed in the trailing 12
                  months</strong> (anchored to our data refresh date for the
                  market).
                </li>
                <li>
                  <strong>At least three distinct addresses</strong>{" "}
                  <em>or</em> <strong>at least one community where we observe
                  thirty or more distinct units</strong> in the trailing 12
                  months.
                </li>
              </ol>
              <p>
                The two-pronged second test admits both scattered-site
                operators (who hit the diversity threshold through breadth) and
                single-asset multifamily operators (who hit it through depth at
                a single community).
              </p>
              <p>
                <strong>Departed-operator gate.</strong> An operator whose most
                recent listing activity — creation or deactivation — predates a{" "}
                <span className="dq-chip dq-tnum">60-day</span> recency cutoff
                is excluded even if it clears the listing and diversity tests,
                so a scorecard never reflects an operator that has wound down or
                left the market. Departure is judged at the operator-name level,
                aggregating the newest event across the id fragments an operator
                churns through over time (see §07), so a still-active operator
                is never dropped on a single stale fragment.
              </p>
              <p className="text-[13.5px] italic text-muted-foreground">
                Earlier methodology versions labeled this window
                &ldquo;T6M&rdquo; on the market headline tile, which was a
                labeling drift; the actual eligibility filter has always been
                T12 in production. v0.6.3 (Patch 2) corrects the surfaced
                label so it matches the underlying computation. No operator
                gains or loses eligibility from the relabel.
              </p>
              <h3
                id="category-exclusions"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Category exclusions.
              </h3>
              <p>
                Two filters remove non-operators before any operator is formed.
                First, listings whose source company type is a data-platform
                artifact — property-management marketing software or
                listing-syndication services — are dropped at the row level;
                they never become an operator, a scorecard, a search result, or
                a market count. Second, a small{" "}
                <strong>curated denylist</strong> catches source-misclassified
                artifacts that slip past the type filter — for example, a
                listing-syndication platform mislabeled as an &ldquo;Owner&rdquo;
                in the source data that would otherwise top a market. The
                denylist is deliberately narrow, reviewed as a code change, and
                surfaced read-only in our admin tooling. These are the exclusion
                rules the earlier methodology promised to document once they
                existed.
              </p>
              <h3
                id="operator-type"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Broker vs. property manager.
              </h3>
              <p>
                We type each operator as a <strong>property manager</strong> or
                a <strong>broker</strong> from the source company-type signal —
                a majority vote across the operator&apos;s listings, with the
                parent company&apos;s type taking precedence. Brokers are
                tracked and scored, but within their own cohort: a property
                manager is only ever ranked against other property managers, and
                a broker only against other brokers (the rent-performance
                baseline is likewise split), and brokers are hidden from the
                default ranked lists behind a &ldquo;show brokers&rdquo; toggle.
              </p>
              <p>
                Because some franchise operators — notably Real Property
                Management offices — hold brokerage licenses and are tagged
                &ldquo;Brokerage&rdquo; at the source despite operating as
                property managers, a small curated override reassigns those
                specific operators to the property-manager cohort. The override
                is keyed on the operator&apos;s name, so it survives the source
                re-issuing new internal ids.
              </p>
            </SectionAnchor>

            {/* === SECTION 02 — URU === */}
            <SectionAnchor
              id="uru"
              num="02"
              title="Unit identity (URU)."
              lede="Each rental property on Dwellsy is resolved to a Unique Rentable Unit before any analysis runs."
            >
              <p>
                The URU is the four-level hierarchy Dwellsy assigns: building
                or community → address → unit → room/bed. All metrics in this
                scorecard operate on the unit level (the third tier),
                aggregated up to the operator&apos;s full portfolio.
              </p>
              <p>
                URU resolution happens upstream of this scorecard in
                Dwellsy&apos;s core data infrastructure. The scorecard consumes
                resolved URUs as inputs — it does not derive them.
              </p>
            </SectionAnchor>

            {/* === SECTION 03 — CLASSIFICATION === */}
            <SectionAnchor
              id="classification"
              num="03"
              title="Operator classification."
              lede="We classify every operator on two independent axes — operator type and scale — combining into a 7-cell taxonomy as of v0.6.2."
            >
              <p>
                <strong>Operator type</strong> measures how the
                operator&apos;s portfolio is organized — whether their units
                are concentrated in multi-unit communities (multifamily
                buildings, build-to-rent communities, condo developments) or
                distributed across individually-managed single-family rentals.
                v0.6.2 refines the v0.6.1 three-way split into a four-way axis
                by splitting MF/BTR by median community size.
              </p>
              <p>
                We group the operator&apos;s portfolio by community and count
                distinct units the operator manages at each community. A
                community is <strong>concentrated</strong> if the operator
                manages <span className="dq-chip dq-tnum">10 or more units</span>{" "}
                there. From that:
              </p>
              <ul>
                <li>
                  <strong>SFR (Scattered)</strong> — concentrated share{" "}
                  <span className="dq-chip dq-tnum">&lt; 30%</span>.
                </li>
                <li>
                  <strong>Small MF/BTR</strong> — concentrated share{" "}
                  <span className="dq-chip dq-tnum">≥ 70%</span> AND median
                  concentrated community size{" "}
                  <span className="dq-chip dq-tnum">10–49 units</span>.
                </li>
                <li>
                  <strong>Large MF/BTR</strong> — concentrated share{" "}
                  <span className="dq-chip dq-tnum">≥ 70%</span> AND median
                  concentrated community size{" "}
                  <span className="dq-chip dq-tnum">≥ 50 units</span>.
                </li>
                <li>
                  <strong>Hybrid</strong> — concentrated share between 30% and
                  70% (no scale split).
                </li>
              </ul>
              <FormulaBlock label="Formula · operator type">
                <span className="text-navy">concentrated_share</span>{" "}
                <Op>=</Op> Σ urus in ≥10-unit communities <Op>/</Op> total urus
              </FormulaBlock>
              <p>
                <strong>Unit-type override (applied first).</strong> Concentrated
                share alone conflates &ldquo;scattered&rdquo; with
                &ldquo;single-family.&rdquo; An operator running apartments
                spread across many small buildings can look Scattered by
                concentration even though they are plainly a multifamily
                operator. To correct this we compute each operator&apos;s{" "}
                <strong>house share</strong> — observed house-type units divided
                by house-plus-apartment units — and when it is{" "}
                <span className="dq-chip dq-tnum">≤ 10%</span> (essentially all
                apartments) we classify the operator as MF/BTR{" "}
                <em>regardless of concentrated share</em>. The Small-vs-Large
                split then follows the same median concentrated community-size
                rule (<span className="dq-chip dq-tnum">≥ 50 units</span> →
                Large, otherwise Small). This override runs <em>before</em> the
                concentrated-share bands above; only operators that are not
                apartment-dominant are classified by concentrated share. About a
                third of eligible operators carry the override.
              </p>
              <FormulaBlock label="Formula · apartment-dominant override">
                <span className="text-navy">house_share</span> <Op>=</Op>{" "}
                house urus <Op>/</Op> (house urus <Op>+</Op> apartment urus)
                {" "}<Op>·</Op> if <Op>≤</Op> 0.10 <Op>→</Op> MF/BTR
              </FormulaBlock>
              <p>
                <strong>Why the Small vs Large MF/BTR split.</strong> MF/BTR
                community size is a structural distinction. A 200-unit Class A
                operator has a different risk profile and different operating
                profile than an operator running 8-unit walk-up small MF. The v0.6.1
                five-cell taxonomy collapsed these into one MF/BTR bucket;
                v0.6.2 makes the distinction visible.
              </p>
              <p>
                <strong>Scale</strong> (Institutional vs Independent) measures
                the operator&apos;s footprint. An operator is{" "}
                <strong>Institutional</strong> if they manage{" "}
                <span className="dq-chip dq-tnum">500 or more</span> distinct
                units across all Operator IQ coverage markets in the trailing
                12 months, <strong>Independent</strong> otherwise. The 500-unit
                threshold is a judgment call; in practice it cleanly separates
                names that operate at scale requiring institutional capital
                structures from established local and regional operators.
              </p>
              <p>
                <em>
                  Scale classification considers an operator&apos;s observed
                  presence across all Operator IQ coverage markets, not just the
                  market in which a given scorecard is published. Operators
                  are Institutional if their combined trailing-12-month
                  observed units across all our covered markets meet or
                  exceed 500. This rule lets us recognize national operators
                  whose footprint in any single market falls below the
                  threshold but whose cross-market scale is substantial. The
                  Hybrid bucket does not carry a scale split — a Hybrid
                  operator is simply Hybrid regardless of cross-market urus.
                </em>
              </p>

              <QuadrantGrid quadrant="" variant="conceptual" />
              <p className="mt-3 text-[13px] italic text-muted-foreground">
                Figure 1. The seven-cell taxonomy. The type axis (rows)
                splits operators into SFR, Small MF/BTR, and Large MF/BTR by
                the apartment-dominant override, concentrated share, and median
                community size. The scale axis
                (columns) splits each type into Independent and Institutional
                by cross-market urus. Hybrid carries no scale split — it is
                its own classification. Cell colors match the quadrant badges
                used elsewhere on the scorecard.
              </p>

              <p>
                The taxonomy is structural, not evaluative. Each cell contains
                operators of varying quality. The classification answers{" "}
                <em>&ldquo;what kind of operator is this?&rdquo;</em> — the
                rest of the scorecard answers{" "}
                <em>&ldquo;how well do they operate?&rdquo;</em>
              </p>
              <div className="dq-callout-soft">
                <p className="dq-callout-tag">7-cell distribution · v0.7</p>
                <p>
                  Across {marketCount} covered markets and 3,649 eligible
                  operators: SFR Independent leads at 57.6%, reflecting the
                  SFR-heavy Southeast + Sun Belt footprint. Small MF/BTR
                  Independent is now the second-largest cell at 25.8% — the
                  apartment-dominant override moved most scattered-apartment
                  operators here, which also shrank Hybrid to 3.3%. MF/BTR
                  Institutional (Small + Large) totals 3.9% of operators but
                  holds the largest absolute urus per operator; Large MF/BTR
                  Independent is 6.5%. (Distribution as of the current snapshot.)
                </p>
              </div>
            </SectionAnchor>

            {/* === SECTION 04 — COMMUNITY VISIBILITY === */}
            <SectionAnchor
              id="community-visibility"
              num="04"
              title="Community visibility (MF/BTR only)."
              lede="Whether an MF or BTR operator is showing Dwellsy a substantial share of the units in the communities they manage, or whether they're listing only a selected subset."
            >
              <p>
                <strong>
                  Why this measure is structural to operator type.
                </strong>{" "}
                Single-family operators cannot meaningfully cherry-pick which
                inventory they show on Dwellsy. Every property is unique. A
                renter searching for a three-bedroom house in a specific
                neighborhood is looking for that specific home with its
                specific layout, yard, and location — the operator cannot
                substitute Property B for Property A. To capture any rental,
                the SFR operator must list it. The cherry-picking risk is
                structurally low.
              </p>
              <p>
                Multifamily and BTR operators sit on undifferentiated inventory
                in a leasing office. A community with 20 vacant two-bedroom
                units can list five and route walk-in prospects to the rest.
                The cherry-picking option is structurally available, and some
                operators use it — historically as a strategy to control which
                units appear in third-party search results.
              </p>
              <p>Community Visibility measures whether this is happening.</p>
              <p>
                <strong>Scope.</strong> We compute Community Visibility for
                operators who meet three conditions: at least one community
                where they manage{" "}
                <span className="dq-chip dq-tnum">30 or more units</span>, at
                least <span className="dq-chip dq-tnum">50%</span> of their
                inventory in concentrated communities, and at least{" "}
                <span className="dq-chip dq-tnum">12 months</span> of listing
                history at those communities. Operators who don&apos;t meet all
                three conditions don&apos;t have this section on their
                scorecard — for them, the question is either unanswerable
                (Scattered operators, where there&apos;s no honest denominator)
                or not yet measurable (operators below the tenure gate).
              </p>
              <p>
                <strong>Formula.</strong> For each qualifying community, we
                compute the operator&apos;s expected listing volume in the
                trailing 12 months based on the community&apos;s true unit
                count (the structural community-size field from Dwellsy&apos;s
                core data, present in every listing row) and a default annual
                turnover rate of{" "}
                <span className="dq-chip dq-tnum">20%</span>. We compare that
                expectation to the operator&apos;s actual listing count.
              </p>
              <FormulaBlock label="Formula · community visibility ratio">
                <span className="text-navy">ratio</span> <Op>=</Op> Σ
                actual_listings_t12 <Op>/</Op> Σ (true_community_size{" "}
                <Op>×</Op> 0.20)
              </FormulaBlock>
              <p>
                The 20% turnover assumption matches the empirical cross-market
                norm across Chattanooga, Jacksonville, and Nashville under
                v0.6.1 — and aligns with the U.S. national rental-household
                mobility rate.
              </p>
              <p>The ratio answers:</p>
              <p>
                <em>
                  &ldquo;Of the units that should have plausibly turned over
                  and been listable in T12, how many did this operator
                  actually list?&rdquo;
                </em>
              </p>
              <p>
                <strong>Three-state taxonomy (v0.6.1, unchanged in v0.6.2).</strong>{" "}
                v0.6 simplified the Community Visibility output to three
                states. The legacy fourth state (&ldquo;above expected —
                comprehensive coverage&rdquo;) was retired because it implied
                a comparative judgment the data couldn&apos;t support; a
                visibility ratio above 1.0× simply means the operator is
                listing comprehensively at higher-than-default turnover, which
                is a positive signal but doesn&apos;t warrant a separate
                color-coded tier.
              </p>
              <p>
                <strong>Reported states:</strong>
              </p>
              <ul>
                <li>
                  <span className="dq-chip dq-chip-orange">
                    Partial visibility
                  </span>{" "}
                  (ratio <span className="dq-mono">&lt;0.5×</span>) — observed
                  listings represent less than half of expected. Notably
                  reduced visibility relative to community structure.
                </li>
                <li>
                  <span className="dq-chip dq-chip-orange">
                    Likely partial visibility
                  </span>{" "}
                  (<span className="dq-mono">0.5–0.8×</span>) — most but not
                  all expected listings present. Possible normal turnover
                  variation, possible selective listing.
                </li>
                <li>
                  <span className="dq-chip">Comprehensive visibility</span> (
                  <span className="dq-mono">≥0.8×</span>) — listings cover the
                  substantial majority of expected turnover. Within expected
                  range for a fully-transparent operator.
                </li>
              </ul>
              <p>
                Ratios materially above 1.0× are meaningful signal — they
                identify operators visibly more transparent than the cohort
                norm, which is a credibility-positive signal. Institutional
                Class A MF communities typically turn over faster than the
                cohort average; a 2.1× visibility ratio for an operator like
                UDR reads as the operator genuinely listing comprehensively.
              </p>
            </SectionAnchor>

            {/* === SECTION 05 — TENANCY === */}
            <SectionAnchor
              id="tenancy"
              num="05"
              title="Days on Market & Tenant Retention."
              lede="The two halves of the lease cycle — how quickly an operator leases a vacant unit, and how long a unit holds a tenant before it comes back to market."
            >
              <h3
                id="days-on-market"
                className="text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Days on Market (DOM).
              </h3>
              <p>
                DOM measures lease-up speed — how efficiently an operator moves
                a vacant unit off the market. It is the joint-largest component
                of the composite (
                <span className="dq-chip dq-tnum">30%</span>) because it
                captures pricing strategy, marketing reach, and lease-up
                execution in a single clean signal.
              </p>
              <p>
                For each trailing-12-month listing where the listing was
                deactivated on or after it was created, per-listing DOM is the
                number of days the listing stayed live.
              </p>
              <FormulaBlock label="Formula · days on market">
                <span className="text-navy">dom_listing</span> <Op>=</Op>{" "}
                deactivation <Op>−</Op> creation{" "}
                <span className="text-muted-foreground">(days)</span>
              </FormulaBlock>
              <p>
                The operator&apos;s DOM is the{" "}
                <strong>median</strong> across its house and apartment listings.
                We use median rather than mean because listing-duration
                distributions are right-skewed. Lower DOM means faster lease-up:
                the metric is inverted for star assignment, so an operator in
                the top quartile of its cohort (fastest lease-up) earns a gold
                star.
              </p>

              <h3
                id="tenant-retention"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Tenant Retention.
              </h3>
              <p>
                Longer tenure reflects multiple compounding operator behaviors
                — tenant screening, property condition, responsiveness, fair
                renewal pricing — and is one of the cleanest behavioral signals
                in the scorecard.
              </p>
              <p>
                We measure retention with a{" "}
                <strong>Kaplan-Meier survival estimate</strong> of how long
                units hold a tenant. For every unit an operator has listed two
                or more times, each occupied interval — from a listing&apos;s
                deactivation to the same unit&apos;s next listing creation — is
                a completed <strong>tenancy</strong>, provided it lasts at least{" "}
                <span className="dq-chip dq-tnum">3 months</span> (shorter
                re-posts are re-listing noise and are dropped). A unit whose most
                recent listing has closed but not yet re-listed contributes a{" "}
                <strong>right-censored</strong> observation: the tenant may still
                be in place, so we know only that tenure is <em>at least</em> the
                time since deactivation.
              </p>
              <FormulaBlock label="Formula · tenancy event & censoring">
                <span className="text-navy">event</span> <Op>=</Op>{" "}
                next_creation <Op>−</Op> prev_deactivation{" "}
                <span className="text-muted-foreground">(months, ≥ 3)</span>
                <br />
                <span className="text-navy">censored</span> <Op>=</Op> now{" "}
                <Op>−</Op> last_deactivation
              </FormulaBlock>
              <p>
                Pooling every unit&apos;s events and censored observations, the
                Kaplan-Meier product-limit estimator yields{" "}
                <span className="dq-mono">S(t)</span> — the probability a tenancy
                lasts at least <em>t</em> months. The ranked metric is{" "}
                <strong>
                  <span className="dq-mono">S(18)</span>
                </strong>
                , the share of tenancies that reach 18 months, shown as a
                percentage and phrased &ldquo;about X% of tenancies reach 1.5
                years.&rdquo; Higher is stickier, so a top-quartile operator
                earns a gold star; we also report the full curve at 12, 18, and
                24 months. Because censoring is handled natively by the
                estimator, an operator with a short observation window is no
                longer biased downward the way a raw gap-median would be — the
                censoring correction the earlier methodology deferred is now the
                metric itself.
              </p>
              <div className="dq-callout-important">
                <p className="dq-callout-tag">
                  Qualification, suppression &amp; recency · v0.7
                </p>
                <p>
                  A survival estimate is only trustworthy with enough long-lived
                  units and real turnover, so we surface{" "}
                  <span className="dq-mono">S(18)</span> only when an operator
                  has at least{" "}
                  <span className="dq-chip dq-tnum">25 observations</span>{" "}
                  reaching 18 months and at least{" "}
                  <span className="dq-chip dq-tnum">5 turnover events</span>.
                  Below either threshold the metric is{" "}
                  <strong>suppressed</strong>: the Tenant Retention card shows no
                  value and no star, and the operator&apos;s composite is
                  re-normalized across its remaining metrics (the retention
                  weight is redistributed, not scored as zero). The card instead
                  reads &ldquo;Too early to assess renewal — this operator has
                  been tracked N years.&rdquo; Separately, operators whose most
                  recent listing event is more than 60 days old are treated as
                  departed and dropped from the ranked set entirely (see §01).
                </p>
              </div>
            </SectionAnchor>

            {/* === SECTION 06 — RENT TRAJECTORY === */}
            <SectionAnchor
              id="rent-trajectory"
              num="06"
              title="Mix-adjusted rent trajectory."
              lede="How the operator's rents have moved over time, adjusted for bedroom mix to control for the most basic compositional difference between portfolios."
            >
              <p>
                We bucket trailing-six-quarters listings by quarter, compute
                median rent within each bedroom bucket (1-bedroom, 2-bedroom,
                3-bedroom-and-up), and average across buckets weighted by the
                operator&apos;s overall bedroom mix. The result is the
                mix-adjusted median rent per quarter.
              </p>
              <p>
                The trajectory chart shows the last six quarters. The headline
                YoY change compares the two most recent trailing-four-quarter
                windows: it is the mean mix-adjusted rent across the most recent
                four quarters divided by the mean across the prior four
                quarters, minus one. Averaging four quarters on each side
                smooths quarter-to-quarter noise; the figure is computed only
                when each four-quarter window has at least two non-null
                quarters.
              </p>
              <div className="dq-rationale">
                <p className="dq-rationale-label">Reported, not ranked.</p>
                <p>
                  We deliberately exclude rent <em>level</em> from the
                  composite ranking. Rent level reflects portfolio quality
                  position more than operator capability — a Class A operator
                  and a Class C operator can both perform exceptionally well on
                  their respective portfolios, but rent level alone would rank
                  one higher than the other based on inherited inventory
                  quality. We report the trajectory because the information is
                  useful in context. We do not rank operators on rent level
                  because it&apos;s the wrong question for evaluating operator
                  quality.
                </p>
              </div>
            </SectionAnchor>

            {/* === SECTION 07 — RENT PERFORMANCE === */}
            <SectionAnchor
              id="rent-performance"
              num="07"
              title="Rent performance."
              lede="The rent-related signal that does belong in operator ranking — measuring not the rent level but how the operator's rents move relative to comparable peers during the same period."
            >
              <p>
                <strong>Formula.</strong> We compute the operator&apos;s
                mix-adjusted YoY rent change (from §06) and subtract the MSA
                cohort median YoY change over the same period. Operators whose
                rents grew faster than the cohort median are positive on Rent
                Performance. Operators who lagged the cohort are negative.
              </p>
              <FormulaBlock label="Formula · rent performance delta">
                <span className="text-navy">delta</span> <Op>=</Op> pm_yoy
                <Op>−</Op> cohort_median_yoy
              </FormulaBlock>
              <p>
                The delta shown on a scorecard uses the market-wide
                property-manager median as its baseline. For <em>ranking</em> —
                the percentile, star, and composite contribution — each operator
                is compared only within its own operator type: property managers
                against the PM median, brokers against the broker median, never
                pooled.
              </p>
              <p>
                This isolates operator pricing capability from inherited
                portfolio quality. Every operator in the cohort is compared to
                the same peer-group baseline during the same period. Class A
                operators are not rewarded for managing high-rent inventory;
                they are rewarded only when they push rents faster than other
                Class A operators (who would be reflected in the cohort
                median). Similarly, Class C operators aren&apos;t penalized
                for low rent levels — only for failing to push rents at peer
                rates.
              </p>
              <p>
                <strong>Confounders we disclose.</strong> The metric is
                meaningful but noisier than DOM or Tenancy. We control for
                bedroom mix but not for square footage, neighborhood, building
                age, or amenity differences within an operator&apos;s
                portfolio. Three real noise sources:
              </p>
              <ul>
                <li>
                  Submarket exposure (operators concentrated in gentrifying
                  neighborhoods see faster growth regardless of skill).
                </li>
                <li>
                  Mix shift within the trailing window (an operator adding
                  higher-rent properties mid-window shows artificial growth).
                </li>
                <li>
                  Capital events (operators who renovated mid-window push
                  rents through investment, not pure leasing skill).
                </li>
              </ul>
              <p>
                We weight Rent Performance at{" "}
                <span className="dq-chip dq-tnum">10%</span> of the composite
                ranking to reflect these confounders. A future version (v0.7)
                will refine the metric to compare only units that appear in
                both periods — eliminating the mix-shift confound and likely
                justifying a heavier weight at that point.
              </p>

              {/* v0.6.3 Patch 3 — market-level rent-growth aggregate.
                  Sub-anchor inside §07 (Rent performance) because this is
                  the market aggregation of the per-operator signal §07
                  describes. Surfaced on the market landing page Market
                  Snapshot Tile 4 alongside the national benchmark line. */}
              <h3
                id="market-rent-growth"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Market rent growth aggregate.
              </h3>
              <p>
                Each market displays a median year-over-year rent growth
                figure computed across the ranked operators in that market.
                The figure represents the typical ranked operator&rsquo;s
                portfolio rent trajectory over the trailing 12 months. The
                benchmark line (&ldquo;vs national&rdquo;) compares the
                market value against the median across all ranked operators
                across all coverage markets — a single national number that
                does not vary by market.
              </p>
              <p>
                <strong>Computation.</strong> Each operator&rsquo;s value is its
                own mix-adjusted YoY rent change (the four-quarter-over-
                four-quarter figure from §06) — <em>not</em> the cohort-relative
                delta. The market aggregate is the equal-weighted median of
                those per-operator values across the market&rsquo;s{" "}
                <strong>eligible property managers</strong> (brokers are
                excluded). Operator-equal weighting keeps the metric
                interpretable — &ldquo;the typical property manager in this
                market&rdquo; — rather than letting a few large portfolios
                dominate; a unit-weighted alternative is a possible future
                refinement.
              </p>
              <FormulaBlock label="Formula · market rent growth T12">
                <span className="text-navy">market_rent_growth_t12</span>{" "}
                <Op>=</Op> median<sub>i ∈ eligible PMs in market</sub>
                {" "}(operator<sub>i</sub>.pmYoyChange)
              </FormulaBlock>
              <FormulaBlock label="Formula · national benchmark">
                <span className="text-navy">national_rent_growth_t12</span>{" "}
                <Op>=</Op> median<sub>i ∈ eligible PMs (all markets)</sub>
                {" "}(operator<sub>i</sub>.pmYoyChange)
              </FormulaBlock>
              <p>
                The market-vs-national delta is surfaced as a tile benchmark
                line (green if &gt; +0.2 pp, orange if &lt; −0.2 pp, neutral
                within the band). The national reference is a single value
                computed across every covered market; where a snapshot does not
                yet carry it, the tile shows the market value without a national
                comparison. Submarket-level rent growth is not computed —
                listing-level geographic aggregation with minimum-N controls
                remains a future candidate; under a submarket filter the
                headline tile retains the MSA-wide value with an explicit scope
                annotation.
              </p>

              {/* v0.6.3 Patch 5 — state-level aggregates sub-anchor. Sits
                  inside §07 because state-level rent growth is the same
                  per-operator pmYoyChange aggregated across in-state MSAs
                  rather than within an MSA. State-level median DOM has the
                  same shape. Documented separately from the market-level
                  aggregate above so the multi-market double-count caveat
                  is hard to miss. */}
              <h3
                id="state-aggregates"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                State-level aggregates.
              </h3>
              <p>
                State-level aggregates pool operators across all MSAs in a
                state. The <strong>counts</strong> — active operators and
                operators eligible for ranking — deduplicate by{" "}
                <span className="dq-mono">canonicalOperatorId</span>, so a
                multi-market operator counts once per state rather than once per
                MSA. The state-level <strong>medians</strong> (DOM, rent growth)
                still pool one value per operator per MSA, so an operator that
                appears in several in-state MSAs contributes once for each;
                pushing canonical dedup down to the medians is a future
                candidate.
              </p>
              <p>
                The state landing pages at{" "}
                <span className="dq-mono">/property-managers/[state]</span>{" "}
                surface four operator-weighted tiles —{" "}
                <strong>active operators</strong> (sum across MSAs),{" "}
                <strong>eligible for ranking</strong> (sum across MSAs),{" "}
                <strong>median DOM T12</strong> (operator-weighted median
                across the pooled in-state ranked operators), and{" "}
                <strong>rent growth T12</strong> (operator-weighted median
                of <span className="dq-mono">pmYoyChange</span> across the
                same pool). Median DOM and rent growth carry a &ldquo;vs national&rdquo;
                benchmark line where the national reference is the
                operator-weighted median across every ranked operator in
                every covered MSA — the same single national number that
                Patch 3 already computes for market-level rent growth, and
                its DOM analogue computed at runtime.
              </p>
              <p>
                Single-MSA states get the same UX as multi-MSA states; the
                state page renders one MSA card. As
                coverage expands and adds new MSAs in already-covered
                states, the state page auto-updates without any data-layer
                changes: state membership is derived from each market&rsquo;s{" "}
                <span className="dq-mono">state</span> field.
              </p>

              {/* v0.6.3 Patch 6 — share-of-market trajectory sub-anchor.
                  Lives in §07 alongside the market-rent-growth and
                  state-aggregates sub-anchors because all three share the
                  "aggregate / pool / compare" methodology shape. Patch 6
                  itself is about listing-volume share rather than rent
                  level, but the methodology-evolution discussion (why
                  share-based and not absolute) reads naturally here. */}
              <h3
                id="share-trajectory"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Share trajectory.
              </h3>
              <p>
                <strong>Share trajectory</strong> shows how this
                operator&rsquo;s share of ranked-cohort listing activity
                has changed year-over-year. The metric is computed across
                continuing operators with substantial presence in both
                periods (at least 30 listings in each), normalized to
                share of the cohort&rsquo;s total listings so that
                proportional pipeline expansion across all operators
                produces a 0% trajectory. Real movement indicates relative
                gain or loss of market position.
              </p>
              <p>
                <strong>Continuing cohort.</strong> Operators with at least
                30 listings in BOTH the trailing 12 months (T12) AND the
                prior 12-month window (T24-T12). Operators outside the
                cohort fall into one of two display categories:{" "}
                <em>Newly tracked</em> (≥30 listings T12 but &lt;30 in the
                prior window) or <em>New operator</em> (zero prior
                listings). These operators see a context pill in place of
                a comparison number; their data is excluded from the
                cohort median.
              </p>
              <FormulaBlock label="Formula · share trajectory">
                <span className="text-navy">total_t12</span> <Op>=</Op> Σ
                t12ListingsCount over continuing cohort
                <br />
                <span className="text-navy">total_t24t12</span> <Op>=</Op>{" "}
                Σ t24t12ListingsCount over continuing cohort
                <br />
                <span className="text-navy">share_t12</span> <Op>=</Op>{" "}
                op.t12ListingsCount <Op>/</Op> total_t12
                <br />
                <span className="text-navy">share_t24t12</span> <Op>=</Op>{" "}
                op.t24t12ListingsCount <Op>/</Op> total_t24t12
                <br />
                <span className="text-navy">shareTrajectoryYoY</span>{" "}
                <Op>=</Op> (share_t12 − share_t24t12) <Op>/</Op> share_t24t12
              </FormulaBlock>
              <p>
                <strong>Why share rather than absolute?</strong> An earlier
                version of the metric computed absolute year-over-year
                listing-count change. A pressure test surfaced three biases
                that made the absolute version unusable: pipeline-coverage
                expansion (every operator appeared to grow even if they did
                nothing), thin-baseline noise (operators with 1 listing in
                the prior period produced absurd growth percentages), and
                survivor bias (operators that shrank to zero between
                periods were systematically excluded from the median). The
                share-based reframe addresses the first two biases directly
                and partially addresses the third. The pressure-test
                results, post-revision, show plausible directional signal
                consistent with known market dynamics — Phoenix at +10.07%
                (established operators consolidating), Memphis at −9.89%
                (SFR aggregators entering aggressively), Clarksville at
                −15.81% (heaviest fragmentation in the v0.6.3 footprint).
              </p>
              <p>
                <strong>Why no star treatment?</strong> Share trajectory is
                a <em>context</em> metric, not a performance one. A higher
                share isn&rsquo;t reliably better: longer tenancies →
                fewer relistings → lower share (good operationally, lower
                share); improving operationally drops the share via the
                same mechanism. M&amp;A activity, portfolio composition
                shifts, and new entrants all move share without reflecting
                operator health. Star treatment requires a metric where
                &ldquo;higher = better&rdquo; is reliably true; share
                trajectory fails that test. The scorecard shows the metric
                with cohort + national context and methodology disclosure
                so readers can form their own judgment.
              </p>
              <p>
                <strong>Residual caveats.</strong> Coverage bias is only
                neutralized if pipeline improvements affected all
                continuing operators uniformly — non-uniform improvement
                (e.g., a new ingestion source biased toward aggregators)
                would still distort. Survivor bias persists for operators
                that shrank to zero between periods; v0.7 backlog includes
                a &ldquo;departed&rdquo; classification to surface them.
                Listing-level re-listing methodology affects numerator and
                denominator alike but is a counting artifact worth
                acknowledging. The metric is shown for context and is{" "}
                <strong>not used in ranking or composite scoring</strong>.
              </p>

              {/* v0.6.4 Patch 1 — canonical operator identity sub-anchor.
                  Lives at the end of §07 alongside the other aggregate /
                  pool / compare sub-anchors (market rent growth + state
                  aggregates + share trajectory) since cross-market dedup
                  is the methodology piece that ties the per-market PM
                  surface to the new cross-market operator profile. */}
              <h3
                id="canonical-operator-identity"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Operator identity.
              </h3>
              <p>
                Two problems complicate &ldquo;who is this operator?&rdquo;: the
                same operator can appear in several markets, and the source data
                periodically re-issues an operator new internal ids, splitting
                one operator into several records within a single market. We
                resolve both into a single canonical operator entity, which
                powers the cross-market profile at{" "}
                <span className="dq-mono">/operators/[canonical-slug]</span> and
                dedup&rsquo;d state-level counts.
              </p>
              <p>
                <strong>Cross-market identity is ID-based.</strong> Operators
                appearing in multiple markets are linked primarily by
                Dwellsy&rsquo;s own parent-company id (
                <span className="dq-mono">parentCompanyId</span>), taken per
                operator as the modal parent id across its listings. At merge
                time, operators sharing a parent id are grouped into one
                canonical entity with a shared id slugged from the parent-company
                name. This id-based grouping is <strong>authoritative</strong> —
                it overrides any name-based assignment. It unites a parent&rsquo;s
                differently-branded entities and keeps same-named-but-
                differently-owned operators apart, which is exactly the
                roll-up / parent-entity mapping earlier methodology had deferred.
              </p>
              <p>
                <strong>Curated name mapping is the fallback.</strong> Operators
                that carry no parent id fall back to a human-curated cross-market
                mapping held in versioned decision files. These are reviewed for
                same-name false positives — generic names that collide across
                markets but represent unrelated companies (e.g. two distinct
                &ldquo;Trinity Management Company&rdquo; operators) are excluded
                and stay separate. Curated groupings are protected: the id linker
                never overrides them. A conservative name normalization —
                lowercase, strip legal suffixes and punctuation, collapse
                whitespace — is used to propose candidate matches for that review
                and to normalize parent-company names so corrected casing
                survives the merge.
              </p>
              <h3
                id="fragment-merge"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Within-market fragment merge.
              </h3>
              <p>
                When the source re-issues an operator new internal ids, one
                operator fragments into several no-parent records in the same
                market. Two mechanisms re-pool them. An{" "}
                <strong>exact-tier auto-merge</strong> groups no-parent records
                whose names are identical after stripping legal suffixes and
                punctuation — but only when the shared name is{" "}
                <em>distinctive</em> (at least two tokens, at least one not a
                generic word like &ldquo;property&rdquo; or
                &ldquo;management&rdquo;), so purely-generic or single-token
                names never auto-merge. A <strong>curated merge list</strong>{" "}
                handles the remainder, and curated decisions win over auto-merges
                on any conflict.
              </p>
              <p>
                <strong>Guards.</strong> Placeholder names (&ldquo;Company Name
                Not Provided&rdquo; and similar) and any pair on an explicit
                do-not-merge denylist are never merged; structural invariants —
                every survivor is a real member, no record spans two distinct
                names, no slug collisions — are asserted on every pipeline run,
                and a sign-off report is emitted for review. Below-threshold
                id-bearing fragments are surfaced only to an internal merge tool,
                never to the seed, the operator table, or search.
              </p>
              <p>
                <strong>State-level count dedup.</strong> State-level operator
                counts deduplicate by{" "}
                <span className="dq-mono">canonicalOperatorId</span> — a
                multi-market operator that appears in Nashville, Memphis, and
                Clarksville counts once in Tennessee&rsquo;s state-level total.
              </p>

              {/* v0.6.4 Patch 2 — concession activity sub-anchor.
                  Same neighborhood as the other v0.6.4 sub-sections since
                  the classifier output reads against the ranked-cohort
                  context the canonical layer already established. */}
              <h3
                id="concession-activity"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Concession activity.
              </h3>
              <p>
                For every operator in coverage, the classifier scans T12
                listing descriptions for stereotyped concession language —
                &ldquo;one month free&rdquo;, &ldquo;move-in special&rdquo;,
                &ldquo;no deposit&rdquo;, percent-off promotions, and similar
                patterns — and computes the share of T12 listings that mention
                at least one. The result is surfaced on the scorecard as the
                operator&rsquo;s concession rate, with a listing-weighted market
                concession rate as cohort context.
              </p>
              <p>
                <strong>Regex-based, v1 catches stereotyped language.</strong>{" "}
                Detection is pattern-matching, not semantic. The v1 dictionary
                covers about a dozen pattern families (free month, percent
                off, dollar off, no/reduced deposit, move-in special,
                explicit concession, rent reduction, lease special, limited-
                time offer, waived fee, free rent). Indirect or paraphrased
                language (&ldquo;ask us about specials&rdquo; without naming
                the special) will be missed. A v2 LLM-grader pass is on the
                v0.7 backlog.
              </p>
              <p>
                <strong>Context, not ranked.</strong> Concession activity
                does not feed the composite ranking and does not award
                stars. It&rsquo;s presented as a present-tense signal of
                demand or supply stress at the operator level — high
                participation can mean any of: aggressive lease-up, soft
                submarket, large institutional discounting program. Read
                alongside DOM, rent growth, and share trajectory rather
                than in isolation.
              </p>
              <p>
                <strong>Cohort comparison.</strong> The market reference is a{" "}
                <strong>listing-weighted concession rate</strong> — total
                concession-mentioning T12 listings divided by total T12 listings
                across the ranked cohort (operators with no T12 listings are
                excluded). Listing-weighting is used instead of a per-operator
                median because the per-operator distribution is heavily
                zero-inflated, so its median is often just 0. Operators more
                than 20 percentage points above the market rate receive an
                orange accent (elevated concession activity vs the cohort);
                operators more than 20 pp below get a green accent (low
                concession activity).
              </p>
            </SectionAnchor>

            {/* === SECTION 08 — MARKETING === */}
            <SectionAnchor
              id="marketing"
              num="08"
              title="Marketing scores."
              lede="Marketing discipline — whether the operator presents their listings with complete data, consistent quality, and care."
            >
              <p>
                Four subscores, each on a{" "}
                <span className="dq-chip dq-tnum">0–100</span> scale, are
                computed from trailing-12-month listings. Each richness
                subscore saturates near the p90 of the cross-market operator
                distribution, so the top decile earns 100 and the rest spread
                across the range:
              </p>
              <ul>
                <li>
                  <strong>Completeness</strong> — percentage of listings that
                  are fully populated on all three core fields: a non-empty
                  description, at least one photo, and at least one amenity.
                  The test is all-or-nothing per listing — a listing missing
                  any one of the three does not count toward completeness.
                </li>
                <li>
                  <strong>Amenities</strong> — the mean number of amenities per
                  listing, scaled so that an average of 18 reaches 100:{" "}
                  <span className="dq-mono">
                    min(100, 100 × mean_amenities ÷ 18)
                  </span>
                  .
                </li>
                <li>
                  <strong>Description</strong> — a 0.5 / 0.5 blend of text
                  length and content richness, assessed over listings that have
                  a description:{" "}
                  <span className="dq-mono">
                    0.5 × min(100, 100 × mean_distinct_words ÷ 195) + 0.5 × 100
                    × min(1, mean_content_categories ÷ 6)
                  </span>
                  . Length uses distinct words (robust to whitespace or
                  boilerplate padding); content richness counts how many of
                  seven content areas — amenities, location, transit, parking,
                  and pet / fee / lease terms — the prose touches, so an
                  informative listing outscores a long but repetitive one. An
                  operator needs at least five non-blank descriptions to be
                  assessed on the non-blank subset; below that, blanks count
                  (their absence is already reflected in Completeness).
                </li>
                <li>
                  <strong>Photos</strong> — the median number of photos per
                  listing, scaled so that a median of 30 reaches 100:{" "}
                  <span className="dq-mono">
                    min(100, 100 × median_photos ÷ 30)
                  </span>
                  .
                </li>
              </ul>
              <p>
                The reported Marketing Discipline score is a{" "}
                <strong>weighted blend</strong> of the four subscores, not a
                simple average:
              </p>
              <FormulaBlock label="Formula · marketing discipline">
                <span className="text-navy">marketing</span> <Op>=</Op> 0.35{" "}
                <Op>×</Op> completeness <Op>+</Op> 0.20 <Op>×</Op> amenities{" "}
                <Op>+</Op> 0.20 <Op>×</Op> description <Op>+</Op> 0.25 <Op>×</Op>{" "}
                photos
              </FormulaBlock>
              <p>
                Operators with consistently well-prepared, informative listings
                score in the 80s and 90s. Operators with sparse data, missing
                photos, or threadbare descriptions score lower.
              </p>
            </SectionAnchor>

            {/* === SECTION 09 — COMPOSITE === */}
            <SectionAnchor
              id="composite"
              num="09"
              title="Composite & the star system."
              lede="How the per-metric signals combine — a versioned internal composite that never appears on a scorecard, and the per-metric stars that do."
            >
              <p>
                The composite is a single weighted score computed from the
                metrics above. It is versioned and load-bearing internally, but
                it is{" "}
                <strong>
                  never surfaced on a scorecard as a score or an ordinal rank
                </strong>{" "}
                — per our standing rule, scorecards show only stars, values
                against a cohort benchmark, and positions. The composite&rsquo;s
                only visible effect is as the final tie-break in market-list
                ordering, which leads with gold- then silver-star counts and
                falls back to the composite only to break ties within an
                equal-star bucket. The weights still set that ordering and drive
                the PDF export, so we document them here.
              </p>
              <p>
                <strong>
                  Weights for operators with Community Visibility computed:
                </strong>
              </p>
              <table className="dq-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="num">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Days on Market (DOM)</td>
                    <td className="num dq-tnum">30%</td>
                  </tr>
                  <tr>
                    <td>Tenant Retention</td>
                    <td className="num dq-tnum">30%</td>
                  </tr>
                  <tr>
                    <td>Rent Performance</td>
                    <td className="num dq-tnum">10%</td>
                  </tr>
                  <tr>
                    <td>Marketing Quality</td>
                    <td className="num dq-tnum">15%</td>
                  </tr>
                  <tr>
                    <td>Community Visibility</td>
                    <td className="num dq-tnum">15%</td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-7">
                <strong>
                  Weights for operators without Community Visibility
                </strong>{" "}
                (the section is suppressed for Scattered and Hybrid operators
                below the visibility gate, and for MF/BTR operators under the
                12-month tenure threshold):
              </p>
              <table className="dq-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="num">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Days on Market</td>
                    <td className="num dq-tnum">35.3%</td>
                  </tr>
                  <tr>
                    <td>Tenant Retention</td>
                    <td className="num dq-tnum">35.3%</td>
                  </tr>
                  <tr>
                    <td>Rent Performance</td>
                    <td className="num dq-tnum">11.8%</td>
                  </tr>
                  <tr>
                    <td>Marketing Quality</td>
                    <td className="num dq-tnum">17.6%</td>
                  </tr>
                </tbody>
              </table>
              <p>
                The 15% normally allocated to Community Visibility
                redistributes proportionally to the other four components.
                Both schemes sum to 100%, so composite scores remain
                comparable across the full cohort.
              </p>

              <div className="dq-rationale">
                <p className="dq-rationale-label">
                  The philosophy behind these weights
                </p>
                <p>
                  The composite is designed to reward operator{" "}
                  <em>behavior</em>, not inherited portfolio characteristics.
                  DOM and Tenancy share the lead at 30% each because they
                  measure the two halves of the lease cycle — DOM captures how
                  efficiently the operator leases vacant units (pricing
                  strategy, marketing reach, lease-up execution), and Tenancy
                  captures how successfully they retain tenants once placed
                  (screening, property condition, renewal skill). These are
                  the most direct operator-behavior signals available, and
                  over a multi-year investment horizon they compound to drive
                  operator-quality outcomes.
                </p>
              </div>

              <p>
                Marketing Discipline (15%) and Community Visibility (15%) are
                secondary but meaningful signals. Marketing Discipline reflects
                listing-side rigor; Community Visibility reflects transparency.
                Both are real quality differentiators, both are harder to game
                than they look, and both deserve weight without dominating.
              </p>
              <p>
                Rent Performance (10%) is included as a pricing-skill signal
                but weighted lower than the cleaner metrics due to its
                documented confounders.
              </p>
              <p>
                <strong>What we do not weight.</strong> Rent level. Portfolio
                quality. National scale beyond the MSA. These are descriptive
                characteristics, not performance signals. We surface them as
                context but do not let them drive operator rank.
              </p>

              {/* Star system + cohort hierarchy (v0.6.2 Patches 2 + 3) */}
              <h3
                id="star-system"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Star system.
              </h3>
              <p>
                In place of a rank, each metric earns a binary star. Per-metric
                stars are what the scorecard actually leads with — they appear in
                the header star summary, on each operating-metric card, and in
                the market-list row chips.
              </p>
              <ul>
                <li>
                  <span className="dq-chip">🌟 Gold star</span> — top quartile
                  of the applicable cohort (
                  <span className="dq-mono">≥75th percentile</span>).
                </li>
                <li>
                  <span className="dq-chip">⭐ Silver star</span> — second
                  quartile (
                  <span className="dq-mono">50th–75th percentile</span>) —
                  above-median position within cohort.
                </li>
                <li>
                  <span className="dq-chip dq-chip-navy">No star</span> —
                  below the 50th percentile. The cohort qualifier still
                  renders (&ldquo;Present in cohort&rdquo;) but no star
                  icon. This reinforces operator dignity — top performers
                  earn stars; others simply have no star.
                </li>
              </ul>
              <p>
                <strong>Cohort hierarchy.</strong> Star assignment requires
                choosing which cohort to compare against. v0.6.2 pre-computes
                three percentile ranks per metric per PM and selects the
                applicable cohort via a fallback waterfall:
              </p>
              <ol>
                <li>
                  <strong>Primary cohort</strong> — same MSA + same 7-cell
                  quadrant. Used if N{" "}
                  <span className="dq-mono">≥ 10</span>.
                </li>
                <li>
                  <strong>Fallback cohort</strong> — same MSA + same operator
                  type (SFR / MF/BTR / Hybrid), any scale. Used if primary N{" "}
                  <span className="dq-mono">&lt; 10</span> and fallback N{" "}
                  <span className="dq-mono">≥ 10</span>.
                </li>
                <li>
                  <strong>MSA cohort</strong> — all eligible operators in the
                  same MSA. Used as the final fallback.
                </li>
              </ol>
              <p>
                The cohort label displayed in the scorecard (e.g., &ldquo;Gold
                star · Chattanooga SFR Independent cohort&rdquo;) reflects
                whichever level was actually selected.
              </p>
              <p>
                <strong>Broker / property-manager partition.</strong> Every
                cohort — and the rent-performance baseline — is partitioned by
                operator type, so property managers are compared only against
                other property managers and brokers only against other brokers.
                The two operator types are never pooled at any level of the
                waterfall.
              </p>

              {/* Lending signals sub-anchor — kept as a stable anchor so
                  existing "read full methodology" deep links still resolve. */}
              <h3
                id="lending-signals"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Lending signals.
              </h3>
              <p>
                Earlier versions surfaced a dedicated block of four
                underwriting-oriented signals. That standalone block has been
                retired on the web scorecard, and one signal — the old Vacancy
                Signal — has been removed entirely. The three survivors are now
                folded into the scorecard&rsquo;s{" "}
                <strong>Scale &amp; Fit</strong> section as position context
                rather than a separately scored section:
              </p>
              <ul>
                <li>
                  <strong>Operator Stability</strong> — the operator&rsquo;s
                  observation history (years visible) shown against a cohort
                  median. Context only; no star.
                </li>
                <li>
                  <strong>Geographic Concentration</strong> — top-3 city share
                  of observed urus, with a cohort median. Descriptive — no star;
                  concentration is neither inherently favorable nor unfavorable.
                </li>
                <li>
                  <strong>Pricing Tier</strong> — the operator&rsquo;s latest
                  mix-adjusted median rent positioned within the MSA rent
                  distribution: Premium (
                  <span className="dq-mono">≥75th pct</span>) / Mid-market (
                  <span className="dq-mono">25–75th</span>) / Value (
                  <span className="dq-mono">&lt;25th</span>). A positional label,
                  not evaluative.
                </li>
              </ul>
              <p>
                For anyone who wants the original at-a-glance panel, the{" "}
                <strong>PDF export</strong> still renders
                a dedicated three-signal &ldquo;Lending Signals&rdquo; page
                (Operator Stability, Geographic Concentration, Pricing Tier).
                None of these feed the composite.
              </p>
            </SectionAnchor>

            {/* === SECTION 10 — LIMITATIONS === */}
            <SectionAnchor
              id="limitations"
              num="10"
              title="Honest limitations."
              lede="We document what this methodology does well and what it doesn't. This is a working methodology, not a finished one."
            >
              <p>
                <strong>Things we measure cleanly.</strong> Lease-up speed,
                tenant retention, listing data completeness, multifamily/BTR
                transparency, basic portfolio classification.
              </p>
              <p>
                <strong>Things we measure with caveats.</strong> Rent
                Performance carries known confounders (submarket exposure, mix
                shift, capital events). Ordering within thin-data buckets may
                favor small-sample outliers; per-metric qualification gates
                suppress the least-supported values, but we don&apos;t yet apply
                a graded confidence discount.
              </p>
              <p>
                <strong>Things we don&apos;t yet measure.</strong>
              </p>
              <ul>
                <li>
                  Operator transparency for Scattered (SFR) operators. The
                  cherry-picking question is unanswerable for SFR operators in
                  the listings data alone — there is no external denominator
                  we can construct. SFR Credibility is deferred to v1.x,
                  pending claim-flow portfolio attestation.
                </li>
                <li>
                  <em>
                    National scale beyond our covered markets. Operators with
                    substantial portfolios in markets we don&apos;t yet cover
                    may classify as Independent under our methodology even
                    when they operate at institutional scale nationally.
                    Resolution path: expanded market coverage and operator
                    portfolio attestation via the claim flow.
                  </em>
                </li>
                <li>
                  Granular unit quality (square footage, amenities, year
                  built, condition) beyond bedroom count.
                </li>
                <li>Submarket exposure within an MSA.</li>
              </ul>
              <p>
                <strong>Things this scorecard cannot tell you.</strong>{" "}
                Whether the operator will renew their lease with you. Whether
                a specific unit is well-maintained. Whether the operator is
                currently for sale or in a transition. Whether market-level
                conditions are favorable.
              </p>

              <h3
                id="observation-precision"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Observation precision.
              </h3>
              <p>
                Every figure on a scorecard is qualified as{" "}
                <em>observed</em>, not <em>total portfolio</em>. The seed
                surfaces three distinguishable unit-count fields per PM so
                templates can phrase precisely:
              </p>
              <ul>
                <li>
                  <strong>urusT12</strong> — distinct units observed listing
                  in the trailing 12 months. The smallest, most-conservative
                  number.
                </li>
                <li>
                  <strong>observedCommunities</strong> — count of concentrated
                  communities where we observe the operator listing.
                </li>
                <li>
                  <strong>observedCommunityTotalUnits</strong> — sum of the
                  top-down PM-managed unit counts across those observed
                  communities. A proxy for portfolio scale at those locations
                  — not a claim about the operator&apos;s full portfolio.
                </li>
              </ul>
              <p>
                Templates phrase explicitly:{" "}
                <em>
                  &ldquo;managing 8 observed large multifamily communities in
                  the Nashville MSA — communities totaling approximately
                  2,400 units, with 1,069 distinct units observed listing in
                  trailing 12 months.&rdquo;
                </em>{" "}
                We never claim &ldquo;manages 1,069 units&rdquo; or
                &ldquo;operates 2,400 units&rdquo; — both would imply we know
                the operator&apos;s full portfolio.
              </p>
              <p>
                <strong>Estimated managed units.</strong> Because observed urus
                undercount an operator&rsquo;s book — a unit only surfaces when
                it lists, on turnover — we also publish a portfolio-size estimate
                that scales observed urus back up by unit-type turnover (house
                urus × 3.3 + apartment urus × 2.6), shown with a low–high band.
                It is an explicit estimate, labeled as such, never fed into the
                composite, and documented in full on the{" "}
                <Link
                  href="/methodology/portfolio-estimator"
                  className="text-teal hover:underline"
                >
                  portfolio-estimator methodology page
                </Link>
                .
              </p>

              <h3
                id="operator-dignity"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Operator-dignity language gate.
              </h3>
              <p>
                Every auto-generated string — executive summaries,
                distinguishing characteristics, map narratives — passes
                through a dignity-language validator at seed time. Forbidden
                tokens include <em>weak, poor, strong, excellent,
                underperforming, manages X, operates X</em>. Acceptable
                replacements use quartile language and observation
                qualifiers: <em>&ldquo;Gold star · Lease-up Performance,
                top quartile in cohort&rdquo;</em> rather than{" "}
                <em>&ldquo;Strong leasing performance.&rdquo;</em>{" "}
                <em>&ldquo;5 communities observed in our coverage&rdquo;</em>{" "}
                rather than <em>&ldquo;Their portfolio of 5
                communities.&rdquo;</em>{" "}
                The system measures; it does not editorialize.
              </p>

              <h3
                id="deferred-work"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Deferred to future versions.
              </h3>
              <p>The following improvements are tracked for future releases:</p>
              <ul>
                <li>
                  <strong>Same-unit-controlled Rent Performance</strong> —
                  compares only units present in both periods, eliminating the
                  mix-shift confound; likely justifies a heavier composite
                  weight.
                </li>
                <li>
                  <strong>Minimum-N confidence multiplier</strong> on the
                  composite — a graded discount for thin-data operators, beyond
                  the current per-metric qualification gates and rationale text.
                </li>
                <li>
                  <strong>SFR Credibility instrument</strong> — deferred until
                  claim-flow portfolio attestation provides external scope data
                  for scattered operators.
                </li>
                <li>
                  <strong>Submarket-aware peer cohorts</strong> and{" "}
                  <strong>submarket-level rent growth</strong> — activate when
                  listing-level geography with minimum-N controls is added.
                </li>
                <li>
                  <strong>Persistent eligibility per window</strong> — a
                  stability component (consistent eligibility across refreshes)
                  not yet computed.
                </li>
                <li>
                  <strong>Canonical dedup on state-level medians</strong> —
                  state counts already dedup by canonical identity; the medians
                  still pool one value per operator per MSA.
                </li>
                <li>
                  <strong>Operator dispute / appeal process</strong> — as
                  scorecards reach operators, a defined correction path.
                </li>
              </ul>
            </SectionAnchor>

            {/* === SECTION 11 — GLOSSARY === */}
            <SectionAnchor
              id="glossary"
              num="11"
              title="Glossary."
              lede="Terms of art used throughout the scorecards and methodology."
            >
              <GlossaryTable rows={GLOSSARY} />
            </SectionAnchor>

            {/* === SECTION 12 — VERSIONING === */}
            <SectionAnchor
              id="versioning"
              num="12"
              title="Version history."
              lede="Methodology is versioned. Each scorecard cites the version that produced it and the data-freshness date."
            >
              <p>
                Material changes — new metrics, re-weightings, threshold
                shifts — bump the version. Cosmetic changes do not. Prior
                versions remain accessible, and every scorecard carries the
                version it was computed under so historical scorecards can be
                interpreted in their original frame.
              </p>
              <p>Recent versions:</p>
              <table className="dq-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Date</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.7</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      July 2026
                    </td>
                    <td>
                      <strong>
                        Methodology overhaul across metrics, identity, and
                        surface.
                      </strong>{" "}
                      34 covered markets; 3,649 eligible operators.{" "}
                      <strong>Tenant Retention</strong> replaced the
                      re-lease-gap median with a Kaplan-Meier survival estimate —
                      S(18), the share of tenancies reaching 18 months — with a
                      qualification gate (≥25 observations reaching 18 months, ≥5
                      turnover events), suppress-and-reweight when unqualified,
                      and a 60-day departed-operator exclusion.{" "}
                      <strong>Rent Stability</strong> was removed entirely.{" "}
                      <strong>Operator classification</strong> gained an
                      apartment-dominant override (house share ≤ 10% → MF/BTR,
                      applied before the concentrated-share bands), reshaping the
                      distribution (Hybrid 342 → 119; Small MF/BTR Independent is
                      now the second-largest cell). <strong>Marketing
                      Discipline</strong> was recalibrated (p90 rescale, a new
                      photos sub-score, and a length-plus-content-richness
                      description sub-score). <strong>Portfolio size</strong>{" "}
                      moved to a unit-type turnover model (house urus × 3.3 +
                      apartment urus × 2.6, admin-tunable, with a low–high band),
                      superseding the earlier cohort-banded estimator.{" "}
                      <strong>Operator identity</strong> is now ID-based across
                      markets (parentCompanyId authoritative, curated name
                      mapping as fallback) plus a within-market fragment-merge
                      system for id-churned operators; category exclusions
                      (data-platform company types and a curated denylist) and
                      broker-vs-property-manager cohort partitioning were
                      documented. On the surface, the redesigned scorecard
                      (design v2.0) became the default and the earlier Classic
                      layout was retired: rank and composite are never surfaced
                      (the composite stays internal, breaking ties in star-tied
                      lists), and the standalone Lending Signals block was folded
                      into Scale &amp; Fit on the web (kept as a three-signal PDF
                      page; the Vacancy Signal was retired).
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.6.4</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      May 21, 2026
                    </td>
                    <td>
                      <strong>Watch List foundation (PR 1 of ~5).</strong> Data
                      layer + filter evaluator + fit-scoring engine + CRUD
                      API for user-defined target lists. Saved buy
                      boxes hold three layers of criteria — required
                      (deal-breakers), preferred (weighted preferences
                      that drive a 0-100 fit score), excluded (negative
                      filters) — applied across the full operator
                      universe to produce a ranked target list with
                      per-criterion breakdown. Field catalog covers
                      Geographic, Scale (incl. v0.7 portfolio estimates),
                      Asset, Trajectory, and Operator dimensions. Two
                      starter templates seeded — Evernest-style SFR
                      density build-out + Genstone-style integrated
                      services — drawn verbatim from the watch-list spec&rsquo;s
                      worked examples. No editor UI yet (ships in PR 2);
                      minimal admin view at{" "}
                      <span className="dq-mono">/watch-lists</span> for
                      verification. Methodology cohorts + ranking
                      unchanged — Watch List is a screening surface on top
                      of the existing scorecard universe, not a metric
                      revision.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.6.4</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      May 21, 2026
                    </td>
                    <td>
                      <strong>Portfolio Size Estimator</strong>. New
                      size-banded model that estimates total managed
                      units per operator from observed URU activity,
                      keyed on Dwellsy 7-cell × URU bands. Calibrated
                      against a 70 operator-market sample with
                      per-cohort medians + P25/P75 confidence bands.
                      Surfaces on scorecard Layer 5 with cohort
                      attribution and a&nbsp;
                      <Link
                        href="/methodology/portfolio-estimator"
                        className="text-teal hover:underline"
                      >
                        full methodology page
                      </Link>
                      . Estimates also baked into the canonical-
                      operator aggregateStats blob so cross-market
                      profiles can sum the bands across member PMs.
                      Large MF/BTR cohorts receive an explicit
                      &ldquo;insufficient calibration data&rdquo;
                      treatment (n is too small to estimate reliably);
                      those scorecards prompt for a verified
                      self-report via the claim flow rather than
                      pretending to a number. Methodology version
                      unchanged (still v0.6.4) — no cohort or ranking
                      changes; estimator is context only and does not
                      feed the composite.{" "}
                      <em>
                        (Superseded in v0.7 by the unit-type turnover model —
                        see §10 and the portfolio-estimator page.)
                      </em>
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.6.4</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      May 19, 2026
                    </td>
                    <td>
                      Patch 1 — <strong>canonical operator identity</strong>.
                      Same operator running across multiple markets is now
                      grouped under a single canonical entity via name
                      normalization (strip <span className="dq-mono">LLC</span>
                      , <span className="dq-mono">Inc</span>,{" "}
                      <span className="dq-mono">Ltd</span>,{" "}
                      <span className="dq-mono">Co</span>,{" "}
                      <span className="dq-mono">Corp</span> suffixes;
                      lowercase, normalize whitespace). 22 multi-market
                      canonical entities baked at seed time covering 60 of
                      575 PM records — Invitation Homes (4 markets), Mission
                      Rock Residential (5), First Keys Homes (5), and others.
                      New <span className="dq-mono">/operators/[canonicalSlug]</span>{" "}
                      cross-market profile route with aggregate footprint,
                      modal classification (most-frequent 7-cell with
                      lexicographic tiebreaker), and per-market scorecard
                      cards. Search results group multi-market operators
                      under a new <strong>Cross-market operators</strong>{" "}
                      section above ranked single-market results.
                      State-level operator counts deduplicate by canonical
                      identity (a PM appearing in three in-state MSAs counts
                      once on the state page). Scorecard Layer 1 gains a{" "}
                      <strong>cross-market badge</strong> linking to the
                      canonical profile when the operator is multi-market.
                      Normalization is conservative — substantive tokens like{" "}
                      <em>Property Management</em>, <em>Realty</em>, and{" "}
                      <em>Group</em> are preserved; false-positive collisions
                      were manually reviewed and excluded. See §07 sub-anchor
                      on canonical operator identity. Cohort unchanged from
                      v0.6.3.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.6.3</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      May 19, 2026
                    </td>
                    <td>
                      Market headline reframe. New Market Snapshot tiles for{" "}
                      <strong>active operators</strong> (≥3 listings T12) and{" "}
                      <strong>market rent growth T12</strong> with a national
                      benchmark line (Patches 1 + 3). T6M eligibility label
                      corrected to T12 on the tile and on §01 — production
                      always used T12; the surfaced label had drifted (Patch 2,
                      no cohort change). Submarket-aware active-operator
                      counts and footprint-eligible counts when{" "}
                      <span className="dq-mono">?submarket=</span> is active;
                      DOM and rent-growth tiles retain MSA scope with explicit
                      annotation because submarket-level computation requires
                      listing-level geography work scheduled for v0.7. Subheader
                      strip beneath the H1 removed (data duplicated by tiles
                      and footer). Patch 4 added{" "}
                      <strong>star-count list ordering</strong> (gold count
                      desc, silver count desc, composite rank asc) with{" "}
                      <span className="dq-mono">★N ☆M</span> chips on each
                      row; the Operator landscape grid migrated to the v0.6.2
                      7-cell taxonomy with median rent-vs-comp as a third
                      per-cell metric. Patch 5 added{" "}
                      <strong>state landing pages</strong> at{" "}
                      <span className="dq-mono">/property-managers/[state]</span>{" "}
                      with operator-weighted state aggregates pooled across
                      in-state MSAs (see §07 sub-anchor on state aggregates).
                      Patch 6 added{" "}
                      <strong>share-of-market trajectory</strong> to scorecard
                      Layer 5 — operator&rsquo;s share of ranked-cohort listing
                      activity year-over-year, computed across continuing
                      operators with ≥30 listings in both T12 and the prior
                      T24-T12 window. An initial absolute-trajectory version
                      was rejected after a pressure test surfaced pipeline-
                      coverage, thin-baseline, and survivor biases; the
                      revised share-based metric neutralizes the first two
                      and partially addresses the third. Surfaced as a context
                      signal only — no star treatment, not used in ranking.
                      See §07 sub-anchor on share trajectory.
                      Cohort unchanged from v0.6.2.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.6.2</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      May 17, 2026
                    </td>
                    <td>
                      Seven covered markets (Chattanooga, Jacksonville,
                      Nashville, Memphis, Knoxville, Clarksville, Phoenix);
                      572 eligible PMs. Eight methodology patches enabling
                      the v1.0 scorecard design: 7-cell taxonomy (MF/BTR
                      split by median community size), multi-level percentile
                      rank computation (primary / fallback / MSA), star
                      system per metric, Rent Stability methodology fix
                      (12-quarter raw-listings volatility, spec; pipeline
                      catch-up in v0.7), Tenancy short-history caveat,
                      unit-count precision data (urusT12 /
                      observedCommunities / observedCommunityTotalUnits as
                      distinguishable fields), Geographic Concentration
                      pre-computation, and pre-computed scorecard text
                      (executive summaries, distinguishing characteristics,
                      map narratives) with operator-dignity validation at
                      generation time. Ships paired with design v1.0.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.6.1</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      May 17, 2026
                    </td>
                    <td>
                      Three covered markets (Chattanooga, Jacksonville,
                      Nashville). Community Visibility denominator switched
                      to <em>top_down_community_count</em>; default turnover
                      rate dropped from 40% to 20%; anomaly flag retired.
                      Institutional/Independent classification considers
                      cross-market observed units.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.6</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      May 16, 2026
                    </td>
                    <td>
                      Operator classification redefined on both axes.
                      Coverage Confidence renamed to Community Visibility and
                      reformulated. Rent level removed from composite; Rent
                      Performance added. Composite weights rebalanced toward
                      operator behavior. SFR Credibility deferred.
                      Methodology page rewritten to articulate operator-type
                      asymmetry honestly.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.3.4</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      Mar 5, 2026
                    </td>
                    <td>
                      Final Chattanooga-only release. Coverage Confidence
                      chip promoted to headline row. Superseded by v0.6 (and
                      reformulated entirely under v0.6.1).
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.3.0–v0.3.3</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      Nov 2025 – Feb 2026
                    </td>
                    <td>
                      Iterative refinements during initial Chattanooga
                      calibration. Tenancy methodology stabilized at
                      episode-clustering with 180-day window and unit-weighted
                      median.
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-6">
                Data is refreshed monthly. The current snapshot reflects
                listing activity through {dataAsOfLabel}.
              </p>
            </SectionAnchor>
          </article>

          <MethodologyTOC
            items={TOC}
            version={versionLabel}
            dataAsOfLabel={dataAsOfLabel}
          />
        </div>
      </div>

      {/* === FOOTER BAND === */}
      <div className="border-t border-grid bg-[#FAF8F4]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-8 py-5">
          <p className="dq-mono text-[12px] text-muted-foreground">
            Methodology <b className="text-navy">{versionLabel}</b>
            <span className="mx-2 text-muted-2">·</span>
            <b className="text-navy">{designVersionLabel}</b>
            <span className="mx-2 text-muted-2">·</span>
            Last reviewed <b className="text-navy">{dataAsOfLabel}</b>
            <span className="mx-2 text-muted-2">·</span>
            Next scheduled review <b className="text-navy">October 2026</b>
          </p>
          <a
            href="mailto:operatoriq@dwellsy.com"
            className="text-[13px] font-semibold text-teal hover:text-teal-700"
          >
            Email questions to operatoriq@dwellsy.com
          </a>
        </div>
      </div>
    </main>
  );
}
