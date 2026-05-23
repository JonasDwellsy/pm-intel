import Link from "next/link";
import { ClaimTrigger } from "@/components/scorecard/ClaimTrigger";
import { CopyLinkButton } from "@/components/scorecard/CopyLinkButton";
import { StarSummaryChip } from "@/components/scorecard/StarSummaryChip";
import { countOperatorStars } from "@/lib/operators/stars";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { quadrant7Color } from "@/lib/quadrant7-colors";
import type {
  MarketFootprintPill,
} from "@/lib/cross-market";
import type { ScorecardData } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { InfoIcon } from "@/components/scorecard/InfoIcon";

// Layer 1 — Identity hero block (v1.0 design, per Scorecard_Design_Spec_v1.0.md
// Section 3, Layer 1). Five elements in the 5-second-read zone:
//
//   1. Operator name (display headline)
//   2. Claim status badge (Verified pill when claimed; nothing otherwise)
//   3. 7-cell classification badge, color-coded per quadrant7-colors.ts
//   4. Market footprint pills — one per MSA where this operator is observed
//      (Mission Rock surfaces 5; single-market operators render 1)
//   5. Star summary chip + cohort name — same chip the market view Ranked
//      Operators list uses, scaled up via size="lg". Replaces the legacy
//      single composite-star icon + "Top quartile in cohort" prose that
//      drifted from the v0.6.3 Patch 4 "stars speak for themselves"
//      philosophy. Gold + silver counts roll up the per-metric stars
//      across DOM, rent performance, marketing, tenancy, and (when
//      present) community visibility — matching countStars in
//      operator-data.ts and PMListItem.goldCount/silverCount.
export function IdentityHero({
  scorecard,
  isClaimed,
  marketFootprint,
  crossMarketOperator = null,
}: {
  scorecard: ScorecardData;
  isClaimed: boolean;
  marketFootprint: MarketFootprintPill[];
  /** v0.6.4 Patch 1 — non-null when this operator is part of a
   *  multi-market canonical entity. Drives the "Cross-market operator"
   *  badge in the Layer 1 chip row that deep-links to /operators/<slug>. */
  crossMarketOperator?: {
    canonicalSlug: string;
    marketCount: number;
  } | null;
}) {
  const stateSlug = stateCodeToSlug(scorecard.market.state);
  const cityKebab = citySlug(scorecard.market.name);
  const quadrant7Label = scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant;
  const quadrant7 = quadrant7Color(quadrant7Label);
  const cohortName = normalizeCohortName(
    scorecard.rank.compositeCohortName ?? `${scorecard.market.name} MSA cohort`
  );
  // Roll up per-metric stars across the same 5 axes the v0.6.3 Patch 4
  // PMListItem chip uses (DOM, rent perf, marketing, tenancy, community
  // visibility). Composite star is intentionally excluded — it's a
  // roll-up of the others and would double-count.
  const { goldCount, silverCount } = countOperatorStars(scorecard);
  const hasStars = goldCount > 0 || silverCount > 0;

  // Multi-market operators get a row of pills; single-market operators get
  // one. We hide the row entirely if the cross-market lookup couldn't resolve
  // any matches (defensive — shouldn't happen because the focal PM is always
  // a match for itself).
  const showFootprintPills = marketFootprint.length > 1;

  return (
    <header className="border-b border-grid pb-10">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex items-center gap-2 text-xs font-medium text-muted-foreground"
      >
        <Link href="/property-managers" className="hover:text-navy">
          Markets
        </Link>
        <span className="text-muted-2">/</span>
        {/* v0.6.3 Patch 5 — state crumb added between the "Markets" root
            and the market crumb, matching the IA the new state landing
            page promises. stateSlug derives from the 2-letter code via
            STATE_CODE_TO_NAME ("AZ" → "arizona" etc.). */}
        <Link
          href={`/property-managers/${stateSlug}`}
          className="hover:text-navy"
        >
          {stateSlug
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())}
        </Link>
        <span className="text-muted-2">/</span>
        <Link
          href={`/property-managers/${stateSlug}/${cityKebab}`}
          className="hover:text-navy"
        >
          {scorecard.market.fullName}
        </Link>
        <span className="text-muted-2">/</span>
        <span>Property managers</span>
      </nav>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        {/* Left column — name + badges + cohort headline */}
        <div className="min-w-0 flex-1">
          <p className="dq-eyebrow">Property manager scorecard</p>
          <h1 className="mt-2 text-[40px] font-bold leading-[1.05] tracking-[-0.022em] text-navy md:text-[48px]">
            {scorecard.pm.name}
          </h1>

          {/* Badge row — claim status (if claimed) + 7-cell quadrant
              + "Claim this operator" affordance for unclaimed operators.
              The claim button is intentionally muted (text + chevron, no
              filled bg) so it doesn't compete with the primary scorecard
              content — most readers aren't operators; this is for the
              minority who are. */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {isClaimed && <VerifiedPill />}
            <Quadrant7Badge label={quadrant7.label} color={quadrant7} />
            {/* v0.6.4 Patch 1 — cross-market operator chip. Renders only
                when this PM rolls up into a multi-market canonical entity
                (resolved server-side). Links to the operator profile
                page with the aggregated stats + per-market cards. */}
            {crossMarketOperator && (
              <Link
                href={`/operators/${crossMarketOperator.canonicalSlug}`}
                className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-grid bg-white px-3 text-[11.5px] font-semibold text-navy transition-colors hover:border-navy hover:bg-surface-soft focus-visible:border-navy focus-visible:bg-surface-soft focus-visible:outline-none"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
                </svg>
                Cross-market operator · {crossMarketOperator.marketCount} markets
              </Link>
            )}
            {!isClaimed && (
              <ClaimTrigger pmSlug={scorecard.pm.slug} pmName={scorecard.pm.name} />
            )}
          </div>

          {/* Star summary chip + cohort name — matches the market view
              Ranked Operators list pattern (v0.6.3 Patch 4) at hero scale.
              Chip hides at 0 gold + 0 silver so operators without
              per-metric recognition see the cohort label stand alone; the
              info icon on the cohort label leads to the composite
              metric-definition modal where the methodology is explained. */}
          <div
            className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2"
            aria-label={
              hasStars
                ? `${goldCount} gold and ${silverCount} silver per-metric stars in ${cohortName}`
                : `Ranked in ${cohortName}`
            }
          >
            {hasStars && (
              <StarSummaryChip
                goldCount={goldCount}
                silverCount={silverCount}
                size="lg"
              />
            )}
            <p className="flex items-center gap-x-1 text-[19px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy md:text-[22px]">
              <span>{cohortName}</span>
              <InfoIcon metricKey="composite" className="ml-1.5" />
            </p>
          </div>

          {/* Market footprint pills — multi-market only (one pill row when
              operator surfaces in 2+ markets). Each non-current pill links to
              that market's scorecard for the same operator. */}
          {showFootprintPills && (
            <div className="mt-6">
              <p className="dq-eyebrow-muted mb-2">Market footprint</p>
              <div className="flex flex-wrap gap-2">
                {marketFootprint.map((pill) =>
                  pill.isCurrent ? (
                    <span
                      key={pill.marketId}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-navy px-3 py-1 text-[12px] font-semibold text-white"
                      style={{ borderColor: "var(--color-navy)" }}
                      aria-current="page"
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
                      {pill.city}
                    </span>
                  ) : (
                    <Link
                      key={pill.marketId}
                      href={pill.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-3 py-1 text-[12px] font-semibold text-navy transition-colors hover:border-teal hover:text-teal"
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted-2" />
                      {pill.city}
                    </Link>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right rail — methodology badge + Copy link share button.
            Kept compact so the left-column hero stays the primary
            visual weight. The "Claim this profile →" link that used
            to live here was a duplicate of the ClaimTrigger pill
            rendered in the badge row above (left column). One CTA
            per surface; the pill is the canonical entry point.
            PR #75 — Copy link button sits above the methodology
            badge so it's the first thing a prospect-sharing user
            reaches for. Client island; the rest of the hero stays
            server-rendered. */}
        <div className="flex shrink-0 flex-col items-start gap-2.5 md:items-end">
          <CopyLinkButton operatorSlug={scorecard.pm.slug} />
          <span className="dq-methodology-badge dq-tnum">
            Methodology v{scorecard.methodologyVersion.replace(/^v/, "")}
            {scorecard.designVersion && (
              <>
                <span className="text-muted-2">·</span>
                Design {scorecard.designVersion}
              </>
            )}
            <span className="text-muted-2">·</span>
            Data as of {fmtDate(scorecard.dataAsOf)}
          </span>
        </div>
      </div>
    </header>
  );
}

// --- Sub-components ---

function VerifiedPill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-none"
      style={{
        background: "var(--color-good-soft)",
        color: "var(--color-good)",
        borderColor: "color-mix(in srgb, var(--color-good) 22%, transparent)",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M5 12.5l5 5 9-10" />
      </svg>
      Verified
    </span>
  );
}

function Quadrant7Badge({
  label,
  color,
}: {
  label: string;
  color: { fg: string; soft: string; border: string };
}) {
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-[11px] py-[5px] pl-[9px] text-[12px] font-semibold leading-none"
      style={{
        background: color.soft,
        color: color.fg,
        borderColor: color.border,
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color.fg }}
      />
      {label}
    </span>
  );
}

// Strip the " (any scale)" parenthetical that the v0.6.2 seed emits on
// fallback cohort labels (e.g., "Nashville Large MF/BTR (any scale)") and
// append "cohort" if it's missing, so we display "Nashville Large MF/BTR
// cohort" consistently. Client-side transform pending the upstream fix in
// v0.7 (where the seed pipeline will write the canonical form directly).
function normalizeCohortName(raw: string): string {
  const stripped = raw.replace(/\s*\(any scale\)\s*/i, "").trim();
  // Don't double-suffix "cohort" — the canonical MSA-level label already
  // includes it (e.g., "Chattanooga MSA cohort").
  if (/cohort$/i.test(stripped)) return stripped;
  return `${stripped} cohort`;
}

// PR #53 — countOperatorStars moved to src/lib/operators/stars.ts so
// the market list, the scorecard hero, the operator profile, the
// compare table, and the homepage sample cards all read the same
// gold/silver counts for the same operator from one place.
