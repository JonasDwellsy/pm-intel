import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Dwellsy IQ scores property managers (v0.6.2 + design v1.0): inclusion criteria, URU resolution, 7-cell operator classification, community visibility, tenancy with short-history caveat, rent trajectory, rent performance, marketing, composite ranking with star system, Lending Signals overview, and honest limitations.",
};

async function loadVersion() {
  const sample = await prisma.pM.findFirst({
    select: { methodologyVersion: true, dataAsOf: true },
    orderBy: { dataAsOf: "desc" },
  });
  // Design version isn't stored as a column; v1.0 ships alongside v0.6.2
  // methodology and the pair is referenced together in every modal.
  const designVersion = "v1.0";
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
        version: "v0.6.2",
        designVersion,
        dataAsOf: "2026-05-17",
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
  { id: "tenancy", num: "05", label: "Tenancy" },
  { id: "rent-trajectory", num: "06", label: "Rent trajectory" },
  { id: "rent-performance", num: "07", label: "Rent performance" },
  { id: "marketing", num: "08", label: "Marketing scores" },
  { id: "composite", num: "09", label: "Composite ranking" },
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
      "The weighted percentile-rank average across DOM, Tenancy, Rent Performance, Marketing Quality, and (when applicable) Community Visibility.",
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
      "Fraction of an operator's observed urus that sit in communities where they manage 10 or more units. Drives the SFR / MF/BTR / Hybrid classification (< 30%, ≥ 70%, in between).",
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
      "Length of operator observation history in Dwellsy IQ data, measured from the first observed listing. Drives the short-observation caveat on Tenancy (yearsVisible < 3) and the Operator Stability lending signal.",
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
      "Five auxiliary signals (Vacancy, Rent Stability, Operator Stability, Geographic Concentration, Pricing Tier) surfaced alongside the composite. Underwriting-relevant synthesis metrics; don't feed the composite ranking.",
    ref: "§09",
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
              lede="How a property manager qualifies for a Dwellsy IQ scorecard."
            >
              <p>
                Every operator in our coverage markets is evaluated against
                three eligibility tests before a scorecard is produced. The
                tests are designed to filter single-rental owners and one-off
                listings while admitting operators with meaningful market
                presence.
              </p>
              <p>A property manager qualifies if all of the following are true:</p>
              <ol>
                <li>
                  <strong>At least 30 listings observed in the trailing 12
                  months</strong> (anchored to our data refresh date for the
                  market).
                </li>
                <li>
                  <strong>At least three distinct addresses</strong>{" "}
                  <em>or</em> <strong>at least one community with thirty or
                  more listings</strong>.
                </li>
                <li>
                  <strong>At least one currently-active listing</strong> (still
                  active or deactivated within the last 90 days).
                </li>
              </ol>
              <p>
                The two-pronged second test admits both scattered-site
                operators (who hit the diversity threshold through breadth) and
                single-asset multifamily operators (who hit it through depth at
                a single community).
              </p>
              <p>
                We do not maintain category exclusion lists. The thresholds
                above filter out non-operator listings naturally. If future
                markets surface edge cases that slip through, we document the
                exclusion rule then and version the methodology accordingly.
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
                <strong>Why the Small vs Large MF/BTR split.</strong> Lender
                and acquirer prospects care about MF/BTR community size as a
                structural distinction. A 200-unit Class A operator has a
                different risk profile and different acquisition profile than
                an operator running 8-unit walk-up small MF. The v0.6.1
                five-cell taxonomy collapsed these into one MF/BTR bucket;
                v0.6.2 makes the distinction visible.
              </p>
              <p>
                <strong>Scale</strong> (Institutional vs Independent) measures
                the operator&apos;s footprint. An operator is{" "}
                <strong>Institutional</strong> if they manage{" "}
                <span className="dq-chip dq-tnum">500 or more</span> distinct
                units across all Dwellsy IQ coverage markets in the trailing
                12 months, <strong>Independent</strong> otherwise. The 500-unit
                threshold is a judgment call; in practice it cleanly separates
                names that operate at scale requiring institutional capital
                structures from established local and regional operators.
              </p>
              <p>
                <em>
                  Scale classification considers an operator&apos;s observed
                  presence across all Dwellsy IQ coverage markets, not just the
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
                Figure 1. The two axes combine into a seven-cell taxonomy in
                v0.6.2: SFR Institutional, SFR Independent, Small MF/BTR
                Institutional, Small MF/BTR Independent, Large MF/BTR
                Institutional, Large MF/BTR Independent, and Hybrid. The
                figure shows the v0.6.1 five-cell layout — the v0.6.2
                refinement subdivides the MF/BTR row by median community size
                without changing the scale axis or the Hybrid bucket.
              </p>

              <p>
                The taxonomy is structural, not evaluative. Each cell contains
                operators of varying quality. The classification answers{" "}
                <em>&ldquo;what kind of operator is this?&rdquo;</em> — the
                rest of the scorecard answers{" "}
                <em>&ldquo;how well do they operate?&rdquo;</em>
              </p>
              <div className="dq-callout-soft">
                <p className="dq-callout-tag">7-cell distribution · v0.6.2</p>
                <p>
                  Across {marketCount} covered markets and 572 eligible PMs:
                  SFR Independent dominates at 72%, reflecting the SFR-heavy
                  Southeast + Phoenix footprint. MF/BTR Institutional totals
                  3.1% of operators but holds the largest absolute urus per
                  operator. Small MF/BTR Independent (7.0%) and Hybrid (6.1%)
                  are where smaller local operators concentrate.
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
              title="Tenancy."
              lede="How long tenants stay in an operator's units before moving out — one of the strongest signals of post-lease-up operational quality."
            >
              <p>
                Longer tenancy reflects multiple compounding operator behaviors
                — tenant screening, property condition, responsiveness, fair
                renewal pricing — and is one of the cleanest behavioral signals
                in the scorecard.
              </p>
              <p>
                We measure tenancy at the unit level using episode clustering.
                For each unit, we sort all listings by creation date and group
                consecutive listings into episodes — sequences where the next
                listing&apos;s creation falls within{" "}
                <span className="dq-chip dq-tnum">180 days</span> of the prior
                listing&apos;s deactivation. The gap between consecutive
                episodes on the same unit approximates the tenant&apos;s stay.
              </p>
              <FormulaBlock label="Formula · tenancy gap">
                <span className="text-navy">tenancy_gap_uru</span> <Op>=</Op>{" "}
                activation<Op>[</Op>k<Op>]</Op> <Op>−</Op> deactivation
                <Op>[</Op>k<Op>−</Op>1<Op>]</Op>
              </FormulaBlock>
              <p>
                Per-operator tenancy is the{" "}
                <strong>unit-weighted median</strong> of all observed tenancy
                gaps across the operator&apos;s portfolio. We use median rather
                than mean because lease-length distributions are right-skewed
                (a small number of very-long stays would otherwise inflate
                averages). Units with only a single observed episode
                don&apos;t contribute to the calculation — we don&apos;t infer
                tenancy without a measurable gap.
              </p>
              <p>Reported in months, rounded to one decimal.</p>
              <div className="dq-callout-important">
                <p className="dq-callout-tag">
                  Short-observation caveat · v0.6.2
                </p>
                <p>
                  Episode-clustered tenancy is right-censored for operators
                  with short observation history. A tenant who occupied a unit
                  for 24+ months when the operator has only been observed for
                  2.3 years can never produce a 24+ month gap in our data —
                  this biases tenancy estimates downward. v0.6.2 surfaces a
                  short-observation caveat on every PM where{" "}
                  <span className="dq-chip dq-tnum">yearsVisible &lt; 3</span>;
                  the per-PM caveat string renders on the Tenant Retention
                  card in the scorecard. The Kaplan-Meier-style censoring
                  correction is deferred to v0.7+.
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
                YoY change is the percentage difference between the most recent
                quarter and the same quarter one year prior.
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
            </SectionAnchor>

            {/* === SECTION 08 — MARKETING === */}
            <SectionAnchor
              id="marketing"
              num="08"
              title="Marketing scores."
              lede="Marketing discipline — whether the operator presents their listings with complete data, consistent quality, and care."
            >
              <p>
                Three subscores, each on a{" "}
                <span className="dq-chip dq-tnum">0–100</span> scale, are
                computed from trailing-12-month listings:
              </p>
              <ul>
                <li>
                  <strong>Completeness</strong> — percentage of listings with
                  non-null values for rent, bedrooms, bathrooms, square
                  footage, description, amenities, and at least one photo.
                  Each missing field deducts proportionally.
                </li>
                <li>
                  <strong>Amenities</strong> — median count of amenity entries
                  per listing, cap-normalized (20 amenities = 100).
                </li>
                <li>
                  <strong>Description Length</strong> — median description
                  character count, cap-normalized (500 characters = 100).
                </li>
              </ul>
              <p>
                The reported Marketing Quality score is the average of the
                three subscores. Operators with consistently well-prepared
                listings score in the 80s and 90s. Operators with sparse data,
                missing photos, or threadbare descriptions score lower.
              </p>
            </SectionAnchor>

            {/* === SECTION 09 — COMPOSITE === */}
            <SectionAnchor
              id="composite"
              num="09"
              title="Composite ranking."
              lede="The composite combines the metrics above into a single score that orders operators within the MSA cohort."
            >
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
                    <td>Tenancy</td>
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
                    <td>Tenancy</td>
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
                Star system (v0.6.2).
              </h3>
              <p>
                v0.6.2 replaces percentile-rank tier labels (top decile,
                lagging quartile) with a binary star system. Per-metric stars
                surface across the v1.0 design — Layer 1 cohort qualifier,
                Layer 2 headline tiles, Layer 3 card headers, Layer 4 signal
                subcards.
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

              {/* Lending Signals sub-anchor — modal "Read full methodology"
                  links from Layer 4 signal cards land here. */}
              <h3
                id="lending-signals"
                className="mt-10 text-[18px] font-semibold leading-tight tracking-[-0.014em] text-navy"
              >
                Lending Signals.
              </h3>
              <p>
                Five auxiliary signals surface alongside the composite in
                Layer 4 of the v1.0 design. They&rsquo;re underwriting-relevant
                synthesis metrics designed for a 30-second scan by
                lender/acquisition teams; they don&rsquo;t feed the composite
                ranking.
              </p>
              <ul>
                <li>
                  <strong>Vacancy Signal</strong> — fraction of the average
                  leasing cycle spent vacant, computed from DOM and tenancy:{" "}
                  <span className="dq-mono">
                    (DOM<sub>days</sub>/30) / (Tenancy<sub>months</sub> + DOM
                    <sub>days</sub>/30) × 100
                  </span>
                  . Lower = more favorable. Star uses cohort percentile.
                </li>
                <li>
                  <strong>Rent Stability</strong> — standard deviation of
                  trailing-12-quarter YoY rent change in percentage points.
                  Lower volatility = more consistent rent posture. Requires
                  12 quarters of mix-adjusted data; suppressed for operators
                  with shorter history (display:{" "}
                  <em>&ldquo;Insufficient observation history to compute&rdquo;</em>
                  ). Star inverted (lower volatility = top quartile).
                </li>
                <li>
                  <strong>Operator Stability</strong> — composite surfacing
                  yearsVisible (length of observation in Dwellsy IQ data) and
                  market count (cross-market footprint). Persistent
                  eligibility per window is a v0.7 component.
                </li>
                <li>
                  <strong>Geographic Concentration</strong> — top-3 city
                  share of observed urus, with cohort median for context.
                  Linear position indicator — no star, descriptive only.
                  Concentration is neither inherently favorable nor
                  unfavorable.
                </li>
                <li>
                  <strong>Pricing Tier</strong> — operator&apos;s latest
                  mix-adjusted median rent positioned within the MSA rent
                  distribution. Premium (
                  <span className="dq-mono">≥75th percentile</span>) /
                  Mid-market (
                  <span className="dq-mono">25–75th</span>) / Value (
                  <span className="dq-mono">&lt;25th</span>). Positional
                  label, not evaluative.
                </li>
              </ul>
              <p>
                Rent Stability and Geographic Concentration are pre-computed
                at seed time (v0.6.2 Patches 4 + 7). The other three are
                derived at render time from existing seeded fields.
              </p>
              <div className="dq-callout-soft">
                <p className="dq-callout-tag">
                  Rent Stability data-pipeline limitation · v0.7 fix
                </p>
                <p>
                  The v0.6.2 Rent Stability calculation runs against the
                  pre-computed 6-quarter rent trajectory, which forces
                  &ldquo;Insufficient observation history&rdquo; suppression
                  for operators who actually have 3-5 years of underlying
                  listings. Patch 4 specifies computing volatility from the
                  raw listings data over a 12-quarter window. The v0.7 data
                  pipeline will compute from raw listings; until then most
                  operators surface as suppressed even when they shouldn&apos;t.
                </p>
              </div>
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
                shift, capital events). Composite rankings for operators with
                very thin data may favor small-sample outliers — we flag these
                in the rationale text but don&apos;t yet mathematically
                discount them.
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
                Observation precision (v0.6.2).
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
                Deferred to v0.7+.
              </h3>
              <p>The following improvements are tracked for future releases:</p>
              <ul>
                <li>
                  <strong>Kaplan-Meier-style tenancy right-censoring
                  correction</strong> — replaces the v0.6.2 short-history
                  caveat with a mathematical adjustment.
                </li>
                <li>
                  <strong>Rent Stability data pipeline</strong> — compute
                  volatility from raw listings over 12 quarters rather than
                  from the 6-quarter pre-computed trajectory.
                </li>
                <li>
                  <strong>Same-unit-controlled Rent Performance</strong> —
                  eliminates the mix-shift confound; likely justifies a
                  heavier composite weight.
                </li>
                <li>
                  <strong>Minimum-N confidence multiplier</strong> on
                  composite — mathematically discounts thin-data operators
                  (currently surfaced via rationale text only).
                </li>
                <li>
                  <strong>SFR Credibility instrument</strong> — currently a
                  placeholder; unblocks when claim-flow portfolio attestation
                  provides external scope data.
                </li>
                <li>
                  <strong>Submarket-aware peer cohorts</strong> — geographic
                  compatibility threshold activates when major-metro markets
                  with submarket data are added.
                </li>
                <li>
                  <strong>Cross-market national institutional
                  classification</strong> — when 8-10 markets are covered, the
                  multi-market aggregation gets accurate enough for national
                  operators with thin per-MSA presence.
                </li>
                <li>
                  <strong>Operator-identity reconciliation</strong> — replaces
                  the v0.6.2 name-equality cross-market join with a proper
                  identity table.
                </li>
                <li>
                  <strong>Persistent eligibility per window</strong> — the
                  third component of Operator Stability not yet seeded.
                </li>
                <li>
                  <strong>Bedroom-mix portfolio composition</strong> and{" "}
                  <strong>BR-bucketed pricing data</strong> — needed for
                  Layer 5D composition and Layer 5F pricing per-bucket.
                </li>
                <li>
                  <strong>Operator dispute / appeal process</strong> — once
                  operators see scorecards publicly, the dispute process
                  needs definition and execution.
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
            Next scheduled review <b className="text-navy">July 2026</b>
          </p>
          <a
            href="mailto:methodology@dwellsy.com"
            className="text-[13px] font-semibold text-teal hover:text-teal-700"
          >
            Email questions to methodology@dwellsy.com
          </a>
        </div>
      </div>
    </main>
  );
}
