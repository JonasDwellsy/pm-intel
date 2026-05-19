import Link from "next/link";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import { quadrant7Color } from "@/lib/quadrant7-colors";
import type {
  MarketFootprintPill,
} from "@/lib/cross-market";
import type { ScorecardData, StarLevel } from "@/lib/types";
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
//   5. Composite cohort qualifier with star (largest visual element per spec)
//
// Cohort name + star are read from rank.compositeCohortName + rank.compositeStar
// (Patch 3, pre-computed at seed time). Falls back to deriving from rank
// counts if either is absent.
export function IdentityHero({
  scorecard,
  isClaimed,
  marketFootprint,
}: {
  scorecard: ScorecardData;
  isClaimed: boolean;
  marketFootprint: MarketFootprintPill[];
}) {
  const stateSlug = stateCodeToSlug(scorecard.market.state);
  const cityKebab = citySlug(scorecard.market.name);
  const quadrant7Label = scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant;
  const quadrant7 = quadrant7Color(quadrant7Label);
  const compositeStar: StarLevel = scorecard.rank.compositeStar ?? null;
  const cohortName = normalizeCohortName(
    scorecard.rank.compositeCohortName ?? `${scorecard.market.name} MSA cohort`
  );
  const cohortQualifier = starQualifier(compositeStar);

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

          {/* Badge row — claim status (if claimed) + 7-cell quadrant */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {isClaimed && <VerifiedPill />}
            <Quadrant7Badge label={quadrant7.label} color={quadrant7} />
          </div>

          {/* Composite cohort qualifier — biggest visual element below name.
              Star + tier language ("Gold star · cohort name"). */}
          <div
            className="mt-7 flex items-center gap-3"
            aria-label={`Composite cohort qualifier: ${cohortQualifier.label} in ${cohortName}`}
          >
            <StarIcon level={compositeStar} size={32} />
            <div className="min-w-0">
              <p
                className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[19px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy md:text-[22px]"
                style={{
                  color: compositeStar === null ? "var(--color-muted-foreground)" : undefined,
                }}
              >
                <span>{cohortQualifier.label}</span>
                <span className="mx-1 text-muted-2">·</span>
                <span className="text-navy">{cohortName}</span>
                <InfoIcon metricKey="composite" className="ml-1.5" />
              </p>
              {cohortQualifier.descriptor && (
                <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                  {cohortQualifier.descriptor}
                </p>
              )}
            </div>
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

        {/* Right rail — methodology badge + claim CTA. Kept compact so the
            left-column hero stays the primary visual weight. */}
        <div className="flex shrink-0 flex-col items-start gap-2.5 md:items-end">
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
          {!isClaimed && (
            <Link
              href={`/claim/${scorecard.pm.slug}`}
              className="text-[13px] font-medium text-teal hover:text-teal-700"
            >
              Claim this profile →
            </Link>
          )}
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

// Star qualifier label + descriptor sentence per the v1.0 spec (Section 5,
// cohort qualifier templates).
function starQualifier(level: StarLevel): {
  label: string;
  descriptor: string | null;
} {
  if (level === "gold") {
    return {
      label: "Gold star · Composite",
      descriptor: "Top quartile in cohort",
    };
  }
  if (level === "silver") {
    return {
      label: "Silver star · Composite",
      descriptor: "Above median in cohort",
    };
  }
  return {
    label: "No star · Composite",
    descriptor: "Present in cohort",
  };
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

// 5-point star SVG. Gold = filled gold-tone, Silver = filled silver-tone,
// No star = empty outline (subtle muted ring). Sized by `size` prop in px.
function StarIcon({
  level,
  size = 24,
}: {
  level: StarLevel;
  size?: number;
}) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  const fill = isGold
    ? "#E5A800"
    : isSilver
      ? "#9CA3AF"
      : "transparent";
  const stroke = isGold
    ? "#B98700"
    : isSilver
      ? "#6B7280"
      : "var(--color-muted-2)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}
