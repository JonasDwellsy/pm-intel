import { TrackedLink } from "@/components/analytics/TrackedLink";
import { buttonVariants } from "@/components/ui/button";
import { ScorecardCard, type SampleCard } from "./SampleScorecards";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";

// v0.14 — Hero right column is now a single live scorecard card
// (Doorby Property Management in Chattanooga) instead of the v0.12
// operator-type quadrant SVG. The quadrant chart was the right
// messaging hook when the methodology page focused on classification;
// now that the homepage leads with the product itself, a concrete
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
  /** Count of live markets, derived from the seed by the page so the
   *  hero subline never goes stale as we add markets. */
  marketCount: number;
}

export function Hero({ heroCard, marketCount }: HeroProps) {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[1280px] items-start gap-12 px-6 pb-24 pt-20 sm:px-16 lg:grid-cols-[1.45fr_1fr] lg:gap-[72px] lg:pb-32 lg:pt-28">
        {/* Left: copy + CTAs */}
        <div>
          <p className="dq-eyebrow tracking-[0.16em]">
            Operator IQ · part of Dwellsy IQ
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
            Select, screen, and monitor property managers.
          </h1>
          <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-foreground/85 sm:text-[19px]">
            Operator IQ turns Dwellsy&apos;s nationwide listing record into
            observed, reproducible scorecards on 20,000+ property managers — so
            you can shortlist the right operator, vet it before you sign, and
            get alerted when performance moves. Every figure is measured,
            not self-reported.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {/* Primary CTA — "Request access" (mailto sales). Operator IQ
                is enterprise/invite-only, so the marketing hero leads with
                the real conversion path rather than the self-serve
                watch-list builder (that stays the signed-in nav CTA). */}
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "request_access" }}
              href="mailto:sales@dwellsy.com?subject=Operator%20IQ%20access"
              className={
                buttonVariants() +
                " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
              }
            >
              Request access →
            </TrackedLink>
            {/* Secondary CTA — the one full scorecard a logged-out visitor
                can open (public /sample route). Gives prospects an explicit
                "here's a complete example" proof path, in outline style. */}
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "view_sample_scorecard" }}
              href="/sample"
              className="inline-flex h-11 items-center justify-center rounded-md border border-navy bg-white px-6 text-[14.5px] font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              See a full sample scorecard →
            </TrackedLink>
          </div>
          {/* Tertiary CTA — Browse markets keeps the per-MSA explorer one
              click away for visitors who want to start from geography. */}
          <p className="mt-4">
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "browse_markets" }}
              href="/property-managers"
              className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-navy underline-offset-4 hover:underline"
            >
              Browse markets →
            </TrackedLink>
          </p>
          <p className="mt-6 text-[14.5px] italic text-muted-foreground">
            Methodology {METHODOLOGY_VERSION} · Design {DESIGN_VERSION} ·{" "}
            {marketCount} markets live · Any top-200 US market on request.
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
