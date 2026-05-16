import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { buttonVariants } from "@/components/ui/button";
import { QuadrantGrid, type QuadrantOperator } from "@/components/scorecard/QuadrantGrid";

// Three real operators positioned for the marketing punch line: classification
// is the methodology in one image.
const HERO_OPERATORS: QuadrantOperator[] = [
  {
    // Brookside is MF/BTR · Institutional in the real data (bottom-right under
    // our axis convention).
    name: "Brookside",
    sub: "Rank #1 · 868 units",
    quadrant: "MF/BTR / Institutional",
    offset: { x: 0.62, y: 0.32 },
    color: "#2F7A5C",
  },
  {
    // Generation is Scattered · Independent in the real data, but is staged
    // here as the "hybrid SFR + MF" anchor in the marketing visual — pinned
    // close to the central crosshair on the SS-Indep quadrant and given a
    // teal accent + HYBRID badge to communicate the cross-asset story.
    name: "Generation",
    sub: "Rank #4 · cross-asset consistency",
    quadrant: "Scattered Site / Independent",
    offset: { x: 0.84, y: 0.78 },
    color: "#1B6E8C",
    hybrid: true,
  },
  {
    // Doorby is Scattered · Independent (top-left quadrant in our axis system).
    name: "Doorby",
    sub: "Rank #12 · 24 cities",
    quadrant: "Scattered Site / Independent",
    offset: { x: 0.25, y: 0.32 },
    color: "#D97834",
  },
];

export function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[1280px] items-start gap-12 px-6 pb-24 pt-20 sm:px-16 lg:grid-cols-[1.45fr_1fr] lg:gap-[72px] lg:pb-32 lg:pt-28">
        {/* Left: copy + CTAs */}
        <div>
          <p className="dq-eyebrow tracking-[0.16em]">
            Dwellsy IQ · Property Manager Intelligence
          </p>
          <h1 className="dq-h1 mt-5 max-w-[14ch] text-balance text-[44px] leading-[1.04] tracking-[-0.018em] sm:text-[52px] lg:text-[60px]">
            Outside-in intelligence on every property manager in the country.
          </h1>
          <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-foreground/85 sm:text-[19px]">
            Methodology-driven scorecards on lease velocity, pricing posture,
            tenancy position, and operator-type classification. Built for
            institutional diligence — not promotional comparison.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "browse_markets" }}
              href="/property-managers"
              className={
                buttonVariants() +
                " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
              }
            >
              Browse markets →
            </TrackedLink>
            <TrackedLink
              event="lead_form_view"
              properties={{ source: "homepage_hero", cta: "get_matched" }}
              href="/get-matched"
              className="inline-flex h-11 items-center justify-center rounded-md border border-navy bg-white px-6 text-[14.5px] font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              Get matched with a PM →
            </TrackedLink>
          </div>
          <p className="mt-6 text-[14.5px] italic text-muted-foreground">
            Methodology v0.3.4 · 1 market live · National coverage rolling out.
          </p>
        </div>

        {/* Right: quadrant visual */}
        <aside className="rounded-lg border border-grid bg-white p-7 shadow-[0_1px_0_rgb(15_31_63_/_0.02)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="dq-eyebrow-muted">Operator-type quadrant</p>
            <p className="text-[11px] text-muted-2">Methodology v0.3.4</p>
          </div>
          <QuadrantGrid
            quadrant="MF/BTR / Institutional"
            variant="compact"
            operators={HERO_OPERATORS}
          />
          <p className="mt-4 max-w-[42ch] text-[13.5px] italic leading-[1.55] text-muted-foreground">
            Three of 55 operators in Chattanooga, plotted by structural type.
            The grid is the methodology in one image: every PM is mapped before
            they&apos;re ranked.
          </p>
        </aside>
      </div>
    </section>
  );
}
