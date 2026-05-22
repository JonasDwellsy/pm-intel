import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { StarGlyph } from "@/components/scorecard/StarSummaryChip";
import { HomepageSectionHead } from "./SectionHead";
import { buttonVariants } from "@/components/ui/button";
import type { StarLevel } from "@/lib/types";

// PR #53 — Homepage sample cards rebuilt to match the live scorecard
// page's multi-star / five-headline-metric model. Replaces the
// PR #46 4-cell grid (composite + URUs + DOM + portfolio) and its
// "gold-composite" framing, both of which were drift from the
// methodology that actually drives every per-PM scorecard today.
//
// The card surfaces, in order:
//
//   1. MSA eyebrow
//   2. Operator name + StarSummaryChip (N gold + M silver) plus a
//      cohort line — pulled from the same star roll-up the
//      market list / scorecard hero / compare table use
//      (src/lib/operators/stars.ts).
//   3. Type pills (Independent + 7-cell)
//   4. Synthesis line — hand-written per operator in multi-star
//      language, not single-composite phrasing.
//   5. Est. Portfolio band — full-width header treatment, not a
//      grid cell. Point + range + confidence + cohort qualifier.
//   6. 2×2 grid of cohort-relative metrics, each with star icon,
//      headline value, and one line of context:
//        - Lease-up Speed   (DOM days T12)
//        - Tenant Retention (median tenancy months)
//        - Rent Performance (pp vs cohort + YoY context)
//        - Marketing Discipline (score / 100 + percentile)
//      Mobile: stacks to a single column at the sm breakpoint.

export interface PortfolioBand {
  /** "1,200" — the point estimate. */
  point: string;
  /** "(900–1,500 units)" or null when the estimator returned a bare
   *  point with no low/high. */
  range: string | null;
  /** "Medium confidence · SFR Independent (national)" — confidence
   *  tier + cohort qualifier. */
  caveat: string;
}

export interface MetricCell {
  /** Star this metric earned (or null when no star). */
  star: StarLevel;
  /** Headline number + unit, e.g. "13" + "days". */
  headline: string;
  unit: string;
  /** One line of cohort-relative context, e.g. "▼ 5d vs cohort 18d".
   *  Falls back to "n = 79 observed" when cohort comparison isn't
   *  available. */
  context: string;
}

export interface SampleCard {
  slug: string;
  href: string;
  /** "CHATTANOOGA MSA" — eyebrow at the top of the card. */
  marketLabel: string;
  name: string;
  /** N gold per-metric stars earned by this operator. Drives the
   *  StarSummaryChip below the name. */
  goldCount: number;
  silverCount: number;
  badges: Array<{ kind: "green" | "orange" | "teal" | "ink"; label: string }>;
  /** True when the canonical entity is marked as claimed in the
   *  upstream data — surfaces a small "Claimed" pill on the card. */
  claimed?: boolean;
  portfolio: PortfolioBand;
  /** Four cohort-relative metrics. Order matches the live scorecard
   *  page's Synthesis Layer headline tiles. */
  leaseUp: MetricCell;
  tenantRetention: MetricCell;
  rentPerformance: MetricCell;
  marketingDiscipline: MetricCell;
}

function Pill({
  kind,
  children,
}: {
  kind: "green" | "orange" | "teal" | "ink";
  children: React.ReactNode;
}) {
  const styles: Record<typeof kind, string> = {
    green: "bg-good-soft text-good border-[#C7DABA]",
    orange: "bg-orange-soft text-orange-700 border-[#F3D7B3]",
    teal: "bg-teal-soft text-teal border-[#C2DDE6]",
    ink: "bg-navy text-white border-navy",
  };
  return (
    <span
      className={
        "inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11.5px] font-semibold tracking-[0.04em] " +
        styles[kind]
      }
    >
      {children}
    </span>
  );
}

/** Compact star + count chip rendered next to the operator name. We
 *  inline a tighter version of StarSummaryChip here (rather than
 *  importing it directly) because the sample card has a denser type
 *  scale than the market-list / scorecard-hero surfaces and the
 *  shared chip's md size reads slightly large. The SVG glyph is the
 *  same shared component, so the gold/silver tones can't drift. */
function CardStarChip({
  goldCount,
  silverCount,
}: {
  goldCount: number;
  silverCount: number;
}) {
  if (goldCount === 0 && silverCount === 0) return null;
  return (
    <span
      aria-label={`${goldCount} gold, ${silverCount} silver per-metric stars`}
      className="inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-2 py-0.5 text-[11.5px] font-semibold text-navy"
    >
      {goldCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="gold" size={13} />
          <span className="dq-mono">{goldCount}</span>
        </span>
      )}
      {silverCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="silver" size={13} />
          <span className="dq-mono">{silverCount}</span>
        </span>
      )}
    </span>
  );
}

/** Per-metric star next to a cohort-relative cell. Matches the
 *  scorecard SynthesisLayer StarIcon — same tones, same outline
 *  fallback for no-star metrics. */
function CellStar({ level }: { level: StarLevel }) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  const fill = isGold ? "#E5A800" : isSilver ? "#9CA3AF" : "transparent";
  const stroke = isGold ? "#B98700" : isSilver ? "#6B7280" : "#CBD2DE";
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
      className="mt-[2px] shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}

function Cell({ title, cell }: { title: string; cell: MetricCell }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5 leading-none">
        <span className="dq-tnum text-[20px] font-bold tracking-[-0.012em] text-navy">
          {cell.headline}
        </span>
        {cell.unit && (
          <span className="text-[11.5px] font-medium text-muted-foreground">
            {cell.unit}
          </span>
        )}
      </p>
      <div className="mt-1.5 flex items-start gap-1.5">
        <CellStar level={cell.star} />
        <p className="text-[11.5px] leading-[1.4] text-muted-foreground">
          {cell.context}
        </p>
      </div>
    </div>
  );
}

// Exported so the homepage Hero can render a single sample card on
// the right side without duplicating styling. The Hero passes
// `analyticsSource="homepage_hero"` so click events bucket separately
// from the inline-section cards below.
export function ScorecardCard({
  card,
  analyticsSource = "homepage_samples",
}: {
  card: SampleCard;
  analyticsSource?: string;
}) {
  return (
    <TrackedLink
      event="pm_card_click"
      properties={{
        pmSlug: card.slug,
        source: analyticsSource,
      }}
      href={card.href}
      className="group flex flex-col rounded-md border border-grid bg-white p-6 transition-all duration-[180ms] hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_8px_24px_rgb(15_31_63_/_0.06)] sm:p-7"
    >
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {card.marketLabel}
      </p>
      {/* Name block reserves 2 H3 line-heights so cards stay
          structurally identical regardless of name length:
          "Hwb Properties" (1 line) and "Chateau Orleans Realty
          Company" (2 lines) end up the same height, and the chip
          row + cohort row + everything below lines up across the
          three cards. lh is the element's own line-height — at
          22px × 1.2 that's 26.4px per line, so 2lh = 52.8px. */}
      <h3 className="dq-h2 mt-2 min-h-[2lh] text-[22px] leading-[1.2] tracking-[-0.005em]">
        {card.name}
      </h3>
      {/* Star chip sits on its own row. The cohort sub-line that used
          to share this row was repetitive of the ink "SFR Independent"
          pill below and the MSA eyebrow above — removed in favour of
          letting the chip foreground itself as the multi-star summary. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <CardStarChip
          goldCount={card.goldCount}
          silverCount={card.silverCount}
        />
        {card.claimed && (
          <span className="dq-pill dq-pill-green text-[10.5px]">Claimed</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.badges.map((b) => (
          <Pill key={b.label} kind={b.kind}>
            {b.label}
          </Pill>
        ))}
      </div>

      {/* Portfolio band — full-width header treatment, not a grid cell.
          Mirrors the EstPortfolioTile from the scorecard SynthesisLayer
          but at the homepage-card type scale. */}
      <div className="mt-5 rounded-md border border-grid bg-surface-soft px-4 py-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Estimated Portfolio Size
        </p>
        <p className="mt-1 flex items-baseline gap-2 leading-none">
          <span className="dq-tnum text-[24px] font-bold tracking-[-0.012em] text-navy">
            {card.portfolio.point}
          </span>
          <span className="text-[12px] font-medium text-muted-foreground">
            units
          </span>
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.45] text-muted-foreground">
          {card.portfolio.range && <span>{card.portfolio.range} · </span>}
          {card.portfolio.caveat}
        </p>
      </div>

      {/* 2×2 cohort-metric grid. Collapses to a single column at sm
          per the v0.14 mobile rule. */}
      <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <Cell title="Lease-up Speed" cell={card.leaseUp} />
        <Cell title="Tenant Retention" cell={card.tenantRetention} />
        <Cell title="Rent Performance" cell={card.rentPerformance} />
        {/* "Mktg Discipline" abbreviation keeps the title on a single
            line at the lg breakpoint where the card is at its
            narrowest (3-col grid). "Marketing Discipline" wrapped to
            two lines, which threw the cell's vertical rhythm off. */}
        <Cell title="Mktg Discipline" cell={card.marketingDiscipline} />
      </div>
    </TrackedLink>
  );
}

export function SampleScorecards({ cards }: { cards: SampleCard[] }) {
  return (
    <section className="border-t border-grid">
      <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-16 lg:py-28">
        <HomepageSectionHead
          eyebrow="Inside a scorecard"
          title="Institutional-grade analysis on every operator."
          context="Three real operators from our coverage. Every figure shown is produced by the same methodology applied to every PM — no curation, no narrative. Per-metric stars, portfolio estimates, and cohort comparisons pull directly from the live scorecard layer."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <ScorecardCard key={c.slug} card={c} />
          ))}
        </div>
        {cards[0] && (
          <div className="mt-9">
            <Link
              href={cards[0].href}
              className={
                buttonVariants() +
                " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
              }
            >
              View a sample scorecard →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
