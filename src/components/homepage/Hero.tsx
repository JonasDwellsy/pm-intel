import { TrackedLink } from "@/components/analytics/TrackedLink";
import { buttonVariants } from "@/components/ui/button";
import { ScorecardCard, type SampleCard } from "./SampleScorecards";
import { PRIMARY_CTA } from "@/lib/nav";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";

// v0.14 — Hero right column is now a single live scorecard card
// (Doorby Property Management in Chattanooga) instead of the v0.12
// operator-type quadrant SVG. The quadrant chart was the right
// messaging hook when the methodology page focused on classification;
// now that the audience is acquirers, leading with a concrete
// "this is what one of our scorecards looks like" card lands closer
// to the discovery path the rest of the homepage rewards. The card
// renders via the shared ScorecardCard component so the styling
// stays in lock-step with the "Inside a scorecard" section below.

interface HeroProps {
  /** Server-loaded sample card for the right column. Null when the
   *  source PM is missing from the DB — the right column gracefully
   *  collapses to just the hero copy on the left in that case
   *  rather than 500ing the homepage. */
  heroCard: SampleCard | null;
}

export function Hero({ heroCard }: HeroProps) {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[1280px] items-start gap-12 px-6 pb-24 pt-20 sm:px-16 lg:grid-cols-[1.45fr_1fr] lg:gap-[72px] lg:pb-32 lg:pt-28">
        {/* Left: copy + CTAs */}
        <div>
          <p className="dq-eyebrow tracking-[0.16em]">
            Dwellsy IQ · Property Manager Intelligence
          </p>
          {/* PR #52 — eyebrow → H1 gap is owned by `.dq-eyebrow`'s
              `margin-bottom: 0.875rem` rule in globals.css, not by
              an `mt-*` utility on this H1. PR #47 / PR #51 both
              added `mt-3` / `mt-3.5` to this element thinking they
              were setting the gap; both were silently overridden by
              `.dq-h1`'s `margin: 0`. Removing the no-op utility
              now keeps the markup honest about where the spacing
              comes from. */}
          <h1 className="dq-h1 max-w-[14ch] text-balance text-[44px] leading-[1.04] tracking-[-0.018em] sm:text-[52px] lg:text-[60px]">
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

        {/* Right: live sample scorecard. ScorecardCard is the same
            component the "Inside a scorecard" section below renders;
            we pass analyticsSource="homepage_hero" so click events
            bucket separately. The card itself is the entire link
            target — no separate "view scorecard" affordance needed. */}
        {heroCard && (
          <div className="lg:pt-2">
            <ScorecardCard card={heroCard} analyticsSource="homepage_hero" />
          </div>
        )}
      </div>
    </section>
  );
}
