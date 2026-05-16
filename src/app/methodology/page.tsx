import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { QuadrantGrid } from "@/components/scorecard/QuadrantGrid";
import { SectionAnchor } from "@/components/methodology/SectionAnchor";
import {
  FormulaBlock,
  Op,
  Comment,
} from "@/components/methodology/FormulaBlock";
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
    "How Dwellsy IQ scores property managers: operator classification, days-on-market, rent trajectory, listing quality, coverage confidence, and tenancy retention.",
};

async function loadVersion() {
  const sample = await prisma.pM.findFirst({
    select: { methodologyVersion: true, dataAsOf: true },
    orderBy: { dataAsOf: "desc" },
  });
  return sample
    ? {
        version: sample.methodologyVersion,
        dataAsOf: sample.dataAsOf.toISOString().slice(0, 10),
      }
    : { version: "v0.3.4", dataAsOf: "2026-03-05" };
}

// Anchor IDs preserve the existing inbound links from the scorecards and
// homepage (e.g. /methodology#classification, /methodology#dom). The TOC
// labels these "Section 01" through "Section 11" per the new mock structure.
const TOC: TocItem[] = [
  { id: "classification", num: "01", label: "Operator-type classification" },
  { id: "dom", num: "02", label: "Days on Market" },
  { id: "rent-trajectory", num: "03", label: "Mix-adjusted rent trajectory" },
  { id: "pricing", num: "04", label: "Pricing posture & concessions" },
  { id: "listing-quality", num: "05", label: "Listing quality" },
  { id: "coverage", num: "06", label: "Coverage confidence" },
  { id: "tenancy", num: "07", label: "Tenancy position" },
  { id: "ranking", num: "08", label: "Ranking & data sufficiency" },
  { id: "uru", num: "09", label: "Unique Rentable Units" },
  { id: "glossary", num: "10", label: "Glossary" },
  { id: "versioning", num: "11", label: "Versioning" },
];

const GLOSSARY: GlossaryRow[] = [
  {
    term: "URU",
    definition:
      "Unique rentable unit — the basic counting unit; one URU corresponds to one physical unit observed leasing in one cycle, deduplicated across listings.",
    ref: "§09",
  },
  {
    term: "DOM T12",
    definition:
      "Median days on market across the trailing 12 months of listings, computed at URU resolution.",
    ref: "§02",
  },
  {
    term: "Quadrant",
    definition:
      "The 2×2 classification cell (asset class × operating axis) the operator falls into based on observed MSA activity.",
    ref: "§01",
  },
  {
    term: "Peer median",
    definition:
      "The median value across other operators in the same quadrant in the same MSA, weighted by URU count.",
    ref: "§02, §03",
  },
  {
    term: "Hybrid operator",
    definition:
      "An operator with measurable books in two adjacent quadrants. Listed under both with a Hybrid badge; no Hybrid ranking exists.",
    ref: "§01",
  },
  {
    term: "Coverage confidence",
    definition:
      "Ratio of observed listing intensity to expected intensity for a portfolio of the operator's composition. Within / above / below expected.",
    ref: "§06",
  },
  {
    term: "Tenancy gap",
    definition:
      "Months between a unit's prior deactivation and its next activation, measured at URU level across observed episodes.",
    ref: "§07",
  },
  {
    term: "Limited tier",
    definition:
      "Operator with insufficient data sufficiency for headline ranking. Partial scorecard is still produced.",
    ref: "§08",
  },
];

export default async function MethodologyPage() {
  const { version, dataAsOf } = await loadVersion();
  const versionLabel = `v${version.replace(/^v/, "")}`;
  const dataAsOfLabel = fmtDate(dataAsOf);

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
          How Dwellsy IQ scores property managers.
        </h1>
        <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.55] text-muted-foreground sm:text-[19px]">
          Outside-in performance intelligence on property management operators.
          Methodology <span className="dq-mono">{versionLabel}</span>, current
          as of {dataAsOfLabel}.
        </p>
      </section>

      {/* === META HAIRLINE === */}
      <div className="mx-auto mt-10 max-w-[1080px] px-8">
        <div className="border-t border-teal/55" />
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <p className="dq-mono text-navy">
            {versionLabel}
            <span className="mx-3.5 text-muted-2">·</span>
            {dataAsOfLabel}
            <span className="mx-3.5 text-muted-2">·</span>
            Chattanooga MSA · 1 covered market
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
            {/* === SECTION 01 — CLASSIFICATION === */}
            <SectionAnchor
              id="classification"
              num="01"
              title="Operator-type classification."
              lede="Each operator is placed on a 2×2 grid built from observed listing behavior in their MSA, not corporate self-description."
            >
              <p>
                Two axes structure the grid:
              </p>
              <ul>
                <li>
                  <strong>Asset class</strong> — MF / BTR (institutional-style
                  multifamily and build-to-rent) versus Scattered Site
                  (single-family, condo, small multifamily distributed across
                  many addresses).
                </li>
                <li>
                  <strong>Operating axis</strong> — Institutional versus
                  Independent. Institutional is defined by buildings exceeding
                  the 50-unit threshold or scattered books exceeding
                  institutional scale (~1,000 units). Independent is everything
                  below those cutoffs.
                </li>
              </ul>

              <QuadrantGrid quadrant="" variant="conceptual" />
              <p className="mt-3 text-[13px] italic text-muted-foreground">
                Figure 1. The four operator quadrants. Classification is
                derived <em>ex post</em> from observed activity, not
                self-reported business model.
              </p>

              <p>
                A meaningful minority of operators run measurable books on both
                sides of a single axis — most commonly MF/BTR plus scattered
                site in the same MSA. We do not collapse these into a single
                placement. Instead, we flag the operator{" "}
                <span className="dq-chip">Hybrid</span>, report scorecards
                under <em>both</em> applicable quadrants, and surface the
                operator under whichever cohort the reader is browsing. The
                Hybrid badge is a disclosure, not a category in its own right;
                there is no Hybrid ranking.
              </p>
              <p>
                Classification reflects only the observed MSA data; an operator
                may run a materially different mix in markets we do not yet
                cover.
              </p>
            </SectionAnchor>

            {/* === SECTION 02 — DOM === */}
            <SectionAnchor
              id="dom"
              num="02"
              title="Days on Market."
              lede="The median time from a unit being listed to being marked unavailable, computed at unit-rental-unit (URU) resolution."
            >
              <FormulaBlock label="Formula · base">
                <span className="text-navy">DOM</span> <Op>=</Op>{" "}
                deactivation_time <Op>−</Op> creation_time
              </FormulaBlock>
              <p>
                We report three windows:
              </p>
              <ul>
                <li>
                  <strong>DOM T12</strong> — trailing twelve months. Primary
                  ranking input.
                </li>
                <li>
                  <strong>DOM lifetime</strong> — all observed listings,
                  weighted by URU count.
                </li>
                <li>
                  <strong>DOM by asset class</strong> — houses vs apartments,
                  shown separately when each cohort has sufficient N.
                </li>
              </ul>
              <p>Eligibility thresholds for DOM reporting:</p>
              <ul>
                <li>
                  <span className="dq-chip dq-tnum">≥30 listings</span> in
                  trailing six months for within-quadrant ranking.
                </li>
                <li>
                  <span className="dq-chip dq-tnum">≥30 URUs</span> per asset
                  type for the per-asset-type sub-metric to be displayed.
                </li>
                <li>
                  <span className="dq-chip dq-tnum">≥3 PMs</span> in the
                  quadrant cohort for ranking to be reported at all.
                </li>
              </ul>
              <p>
                Each PM&apos;s DOM is reported alongside the peer-quadrant
                median and the MSA-wide median so the gap is interpretable. We
                do not weight by listing recency; a listing closed in week 1 of
                the trailing window carries the same influence as one closed in
                week 52.
              </p>
            </SectionAnchor>

            {/* === SECTION 03 — RENT TRAJECTORY === */}
            <SectionAnchor
              id="rent-trajectory"
              num="03"
              title="Mix-adjusted rent trajectory."
              lede="The median premium (or discount) of an operator's listings versus comparable units, computed per listing and aggregated annually."
            >
              <FormulaBlock label="Formula · per-listing premium">
                <span className="text-navy">premium</span>
                <Op>ᵢ</Op> <Op>=</Op> (rent<Op>ᵢ</Op> <Op>−</Op> median(comp_set
                <Op>ᵢ</Op>)) <Op>/</Op> median(comp_set<Op>ᵢ</Op>)
              </FormulaBlock>
              <p>
                The comp set controls for asset class, bedroom count, and
                geography. A premium of +5% means listings priced 5% above the
                market-comparable median for the same window.
              </p>
              <p>
                The chart shows the five-year trajectory; the{" "}
                <span className="dq-mono">n=</span> label on each bar is the
                number of listings underlying that year&apos;s median. Years
                with fewer than{" "}
                <span className="dq-chip dq-tnum">50 listings</span> are
                flagged but still rendered.
              </p>
              <div className="dq-rationale">
                <p className="dq-rationale-label">Why we mix-adjust</p>
                <p>
                  An operator who shifts from 1-bed-heavy to 3-bed-heavy will
                  show an apparent rent jump without changing their pricing
                  posture at all. Mix-adjustment isolates posture from
                  composition, so the trajectory reflects intent rather than
                  inventory drift.
                </p>
              </div>
            </SectionAnchor>

            {/* === SECTION 04 — PRICING === */}
            <SectionAnchor
              id="pricing"
              num="04"
              title="Pricing posture and concession use."
              lede="Three derived statistics from the rent comparison set, plus an observed concession-use rate."
            >
              <ul>
                <li>
                  <strong>T12 median premium</strong> — the headline rent
                  positioning, summarizing pricing posture across all eligible
                  T12 listings.
                </li>
                <li>
                  <strong>% above market by ≥10%</strong> and{" "}
                  <strong>% below market by ≥10%</strong> — fraction of T12
                  listings in each tail. High tails on either side suggest
                  specialization (or a mismatched comp set).
                </li>
                <li>
                  <strong>Concession rate</strong> — share of T12 listings
                  whose copy mentions a concession (free month,
                  look-and-lease credit, waived deposit, etc.), reported as a
                  multiple of the MSA-wide rate rather than a binary flag.
                </li>
              </ul>

              <div className="dq-callout-soft">
                <p className="dq-callout-tag">Honest limitation</p>
                <p>
                  Concession detection is text-mined from listing copy. We
                  catch most explicit mentions and miss most negotiated
                  concessions that never make it into the listing. Treat
                  &ldquo;concession use&rdquo; as a floor estimate of
                  concession activity, not a complete measurement.
                </p>
              </div>
            </SectionAnchor>

            {/* === SECTION 05 — LISTING QUALITY === */}
            <SectionAnchor
              id="listing-quality"
              num="05"
              title="Listing quality."
              lede="A coarse proxy for marketing discipline. Higher completeness and richer descriptions correlate with faster lease-up."
            >
              <p>
                Each listing is scored 0–5 on a composite completeness score
                built from photo count, amenities mentioned, description
                length, and structured-data presence. We surface three
                rollups:
              </p>
              <ul>
                <li>Composite completeness score (0–5).</li>
                <li>Average amenities mentioned per listing.</li>
                <li>Median description length in characters.</li>
              </ul>
              <div className="dq-rationale">
                <p className="dq-rationale-label">Reader&apos;s note</p>
                <p>
                  Comparison is always against the median operator in the same
                  quadrant — not the whole MSA — so institutional PMs are not
                  being compared against scattered-site mom-and-pops. A 4.0
                  completeness score reads differently inside Institutional MF
                  than inside Independent SFR.
                </p>
              </div>
            </SectionAnchor>

            {/* === SECTION 06 — COVERAGE CONFIDENCE === */}
            <SectionAnchor
              id="coverage"
              num="06"
              title="Coverage confidence."
              lede="Whether the observed Dwellsy listing volume matches what we would expect for a portfolio of this size and composition."
            >
              <FormulaBlock label="Formula · coverage confidence">
                <span className="text-navy">coverage</span> <Op>=</Op>{" "}
                observed_intensity <Op>/</Op> expected_intensity
              </FormulaBlock>
              <p>
                <strong>Observed intensity</strong> is listings per building
                per year in the observed window.{" "}
                <strong>Expected intensity</strong> is modeled from cohort
                tenancy and turnover for a portfolio of the operator&apos;s
                composition.
              </p>
              <p>
                Each operator scorecard surfaces a coverage-confidence chip in
                one of four states, banded by the observed-over-expected ratio:{" "}
                <span className="dq-chip dq-chip-orange">Partial coverage</span>{" "}
                <span className="dq-mono text-muted-foreground">(&lt;0.5×)</span>,{" "}
                <span className="dq-chip dq-chip-orange">
                  Likely partial coverage
                </span>{" "}
                <span className="dq-mono text-muted-foreground">(0.5–0.8×)</span>,{" "}
                <span className="dq-chip">Within expected range</span>{" "}
                <span className="dq-mono text-muted-foreground">(0.8–1.2×)</span>,
                or{" "}
                <span className="dq-chip dq-chip-navy">
                  Above expected — comprehensive coverage
                </span>{" "}
                <span className="dq-mono text-muted-foreground">(≥1.2×)</span>.
                The chip is positioned next to the headline DOM and rent
                figures, not buried in a methodology footer; the integrity of
                the scorecard depends on the reader seeing this signal at the
                same time they see the headline metrics.
              </p>
              <p>
                A ratio near 1.0 indicates we likely see the full book. Ratios
                substantially below 1.0 mean the scorecard may be partial — the
                operator likely lists elsewhere too. Ratios well above 1.0 are
                consistent with whole-property leasing operations and high
                turnover, not over-reporting.
              </p>
            </SectionAnchor>

            {/* === SECTION 07 — TENANCY === */}
            <SectionAnchor
              id="tenancy"
              num="07"
              title="Tenancy position."
              lede="How long tenants stay before turning over, measured at unit-rental-unit level from observed re-listing episodes."
            >
              <FormulaBlock label="Formula · tenancy gap">
                <span className="text-navy">tenancy_gap_uru</span> <Op>=</Op>{" "}
                activation<Op>[</Op>k<Op>]</Op> <Op>−</Op> deactivation
                <Op>[</Op>k<Op>−</Op>1<Op>]</Op>{" "}
                <Comment>// months between consecutive episodes</Comment>
              </FormulaBlock>
              <p>
                For units we observe more than once on the platform (relisted
                after a prior lease), we measure the months between the prior
                lease end and the next listing. The PM&apos;s median is
                compared against the cohort of comparable operators (same
                asset class, similar scale), reported with the cohort&apos;s
                p25–p75 range.
              </p>
              <p>
                <em>At cohort low end (p25)</em>,{" "}
                <em>within cohort range</em>, <em>below cohort range</em>, and{" "}
                <em>above cohort range</em> are position labels relative to
                that distribution.
              </p>

              <aside
                role="note"
                aria-labelledby="caveat-tenancy"
                className="dq-callout-important"
              >
                <p className="dq-callout-tag" id="caveat-tenancy">
                  Critical caveat · comparative, not absolute
                </p>
                <p>
                  Tenancy position is a <strong>comparative</strong> metric,
                  not an absolute one. A median sitting just below cohort p25
                  is not, on its own, a quality signal — high-turnover
                  sub-markets and large-floorplate buildings routinely sit
                  there.
                </p>
                <p className="mt-3">
                  Use this row to ask whether an operator&apos;s tenant base is
                  structurally shorter-tenured than peers, then triangulate
                  with renewal-rate and rent-growth data when available. This
                  is the most context-dependent metric in the scorecard.
                </p>
              </aside>
            </SectionAnchor>

            {/* === SECTION 08 — RANKING === */}
            <SectionAnchor
              id="ranking"
              num="08"
              title="Ranking and data sufficiency."
              lede="Overall rank is a weighted composite. Within-quadrant rank uses the same weights against the operator's structural cohort."
            >
              <table className="dq-table">
                <thead>
                  <tr>
                    <th>Input</th>
                    <th className="num">Weight</th>
                    <th>Normalization</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>DOM T12 vs peer-quadrant median</td>
                    <td className="num dq-tnum">40%</td>
                    <td>Z-score within MSA</td>
                  </tr>
                  <tr>
                    <td>Mix-adjusted rent premium</td>
                    <td className="num dq-tnum">20%</td>
                    <td>Z-score within MSA</td>
                  </tr>
                  <tr>
                    <td>Tenancy gap vs cohort p50</td>
                    <td className="num dq-tnum">20%</td>
                    <td>Z-score within cohort</td>
                  </tr>
                  <tr>
                    <td>Listing quality completeness</td>
                    <td className="num dq-tnum">10%</td>
                    <td>Z-score within quadrant</td>
                  </tr>
                  <tr>
                    <td>Coverage confidence</td>
                    <td className="num dq-tnum">10%</td>
                    <td>Distance-from-1.0 within MSA</td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-6">
                Data sufficiency thresholds for inclusion in headline ranking:
              </p>
              <ul>
                <li>
                  <span className="dq-chip dq-tnum">≥30 listings</span> in
                  trailing six months — minimum sample for inclusion.
                </li>
                <li>
                  <span className="dq-chip dq-tnum">≥3 PMs</span> in the
                  quadrant cohort — minimum for within-quadrant ranking to be
                  reported.
                </li>
              </ul>
              <p>
                Operators below threshold are tagged <em>Limited tier</em> and
                excluded from headline ranking, but still receive a partial
                scorecard with whatever metrics meet their own thresholds.
              </p>
            </SectionAnchor>

            {/* === SECTION 09 — URU === */}
            <SectionAnchor
              id="uru"
              num="09"
              title="Unique Rentable Units (URUs)."
              lede="The basic counting unit underlying every metric on the platform. URUs are how we deduplicate listings into the underlying rentable inventory."
            >
              <p>
                A single physical unit may appear in our listing record many
                times across a year — relisted between tenants, re-listed at a
                new price, mirrored across syndicated listing partners,
                duplicated under formatting variants of the same address. The
                URU is the resolved entity behind those listings: one URU per
                physical unit.
              </p>
              <p>The resolution hierarchy applied to each raw listing:</p>
              <ul>
                <li>
                  <strong>Address normalization</strong> — postal-grade
                  normalization plus alias collapse (e.g.,{" "}
                  <em>St / Street / Str.</em>). Suite / apartment fragments are
                  preserved as the unit selector.
                </li>
                <li>
                  <strong>Operator attribution</strong> — listings claimed
                  under the same operator entity across syndication partners
                  are collapsed first.
                </li>
                <li>
                  <strong>Unit-level deduplication</strong> — listings at the
                  same address + unit selector + operator within a 30-day
                  rolling window collapse to a single URU episode.
                </li>
                <li>
                  <strong>Episode bookkeeping</strong> — each URU carries an
                  ordered list of activation / deactivation episodes used by
                  the tenancy-gap calculation in §07.
                </li>
              </ul>
              <p>
                URUs are the denominator for every per-unit metric the
                scorecard reports — observed units, median DOM, tenancy gaps,
                coverage intensity. Listing-level statistics (e.g.,
                concession-mention rate in §04) remain listing-weighted, since
                each listing is its own marketing artefact.
              </p>
            </SectionAnchor>

            {/* === SECTION 10 — GLOSSARY === */}
            <SectionAnchor
              id="glossary"
              num="10"
              title="Glossary."
              lede="Terms of art used throughout the scorecards and methodology."
            >
              <GlossaryTable rows={GLOSSARY} />
            </SectionAnchor>

            {/* === SECTION 11 — VERSIONING === */}
            <SectionAnchor
              id="versioning"
              num="11"
              title="Versioning."
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
                    <td className="dq-mono whitespace-nowrap">v0.3.4</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      Mar 5, 2026
                    </td>
                    <td>
                      Added cross-asset operating consistency to the listing
                      quality rollup; coverage-confidence chip surface
                      promoted to headline row.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.3.3</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      Feb 5, 2026
                    </td>
                    <td>
                      Tenancy-gap formula re-anchored to URU activation
                      episodes; cohort definition narrowed to same-asset-class
                      operators.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.3.2</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      Jan 8, 2026
                    </td>
                    <td>
                      Mix-adjustment in the rent trajectory expanded to
                      include amenity profile; eligibility threshold raised
                      from ≥20 to ≥30 listings.
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.3.1</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      Dec 4, 2025
                    </td>
                    <td>
                      Coverage-confidence ratio introduced with three named
                      states (within / above / below expected).
                    </td>
                  </tr>
                  <tr>
                    <td className="dq-mono whitespace-nowrap">v0.3.0</td>
                    <td className="dq-mono whitespace-nowrap text-muted-foreground">
                      Nov 6, 2025
                    </td>
                    <td>
                      Initial public methodology release. 2×2 quadrant
                      classification, DOM-led ranking, Chattanooga MSA pilot.
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
