import { TrackedLink } from "@/components/analytics/TrackedLink";
import { buttonVariants } from "@/components/ui/button";
import { QuadrantGrid, type QuadrantOperator } from "@/components/scorecard/QuadrantGrid";
import { PRIMARY_CTA } from "@/lib/nav";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";

// Three real operators positioned for the marketing punch line: classification
// is the methodology in one image.
// PR #46 — sub-labels shortened to avoid horizontal overlap with the
// adjacent operator's label inside the compact hero quadrant. The
// previous longer strings ("Rank #33 · 1,069 units", "1,128 units
// (1,667 nat'l)") collided with each other near the chart's vertical
// axis. New strings keep the market + a single signal each.
const HERO_OPERATORS: QuadrantOperator[] = [
  {
    // UDR — institutional MF/BTR baseline pulled from Nashville.
    name: "UDR",
    sub: "Nashville · ~2,400 units",
    quadrant: "MF/BTR / Institutional",
    offset: { x: 0.62, y: 0.32 },
    color: "#2F7A5C",
  },
  {
    // Brookside — MF/BTR Independent in Chattanooga (271 national
    // units, below the 500 institutional threshold).
    name: "Brookside",
    sub: "Chattanooga · 6d DOM",
    quadrant: "MF/BTR / Independent",
    offset: { x: 0.65, y: 0.65 },
    color: "#8B3A62",
  },
  {
    // Invitation Homes — Scattered Institutional under the cross-
    // market scale rule.
    name: "Invitation Homes",
    sub: "Jacksonville · 1,128 units",
    quadrant: "Scattered / Institutional",
    offset: { x: 0.25, y: 0.32 },
    color: "#1B6E8C",
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
          {/* mt-7 (28px) on H1 — the homepage H1 is large (60px on lg)
              so the prior mt-5 (20px) read tight against the eyebrow.
              Other pages with smaller H1s (briefs index at 36-44px,
              market hero, operator profile) intentionally use less
              spacing; this gap scales with H1 mass. */}
          <h1 className="dq-h1 mt-7 max-w-[14ch] text-balance text-[44px] leading-[1.04] tracking-[-0.018em] sm:text-[52px] lg:text-[60px]">
            Outside-in intelligence on every property manager in the country.
          </h1>
          <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-foreground/85 sm:text-[19px]">
            Methodology-driven scorecards on portfolio scale, operator type,
            operating signals, and market footprint. Built for institutional
            acquisition diligence — not promotional comparison.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {/* Primary CTA — acquirer positioning. Sends visitors
                straight into the template picker so they can clone a
                named acquisition thesis with one click. No auth gate
                until save. */}
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "build_buy_box" }}
              href={PRIMARY_CTA.href}
              className={
                buttonVariants() +
                " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
              }
            >
              {PRIMARY_CTA.label}
            </TrackedLink>
            {/* Secondary CTA — Browse markets keeps the per-MSA
                explorer one click away for visitors who want to start
                with geography rather than thesis. Demoted from
                primary fill to outline in the v0.12 nav reposition. */}
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "browse_markets" }}
              href="/property-managers"
              className="inline-flex h-11 items-center justify-center rounded-md border border-navy bg-white px-6 text-[14.5px] font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              Browse markets →
            </TrackedLink>
          </div>
          <p className="mt-6 text-[14.5px] italic text-muted-foreground">
            Methodology {METHODOLOGY_VERSION} · Design {DESIGN_VERSION} · 10
            markets live · National coverage rolling out.
          </p>
        </div>

        {/* Right: quadrant visual */}
        <aside className="rounded-lg border border-grid bg-white p-7 shadow-[0_1px_0_rgb(15_31_63_/_0.02)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="dq-eyebrow-muted">Operator-type quadrant</p>
            <p className="text-[11px] text-muted-2">
              {METHODOLOGY_VERSION} · {DESIGN_VERSION}
            </p>
          </div>
          <QuadrantGrid
            quadrant="MF/BTR / Institutional"
            variant="compact"
            operators={HERO_OPERATORS}
          />
          <p className="mt-4 max-w-[42ch] text-[13.5px] italic leading-[1.55] text-muted-foreground">
            Three operators drawn from our covered markets, plotted by
            structural type. The grid is the methodology in one image: every
            PM is mapped before they&apos;re ranked. {METHODOLOGY_VERSION}{" "}
            further subdivides MF/BTR by community size into a 7-cell
            taxonomy.
          </p>
        </aside>
      </div>
    </section>
  );
}
