import { TrackedLink } from "@/components/analytics/TrackedLink";
import { buttonVariants } from "@/components/ui/button";
import { ScorecardCard, type SampleCard } from "./SampleScorecards";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";
import { ReportSearch } from "@/components/report/ReportSearch";

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
            Independent operator performance intelligence
          </p>
          {/* PR #52 — eyebrow → H1 gap is owned by `.dq-eyebrow`'s
              `margin-bottom: 0.875rem` rule in globals.css, not by
              an `mt-*` utility on this H1. PR #47 / PR #51 both
              added `mt-3` / `mt-3.5` to this element thinking they
              were setting the gap; both were silently overridden by
              `.dq-h1`'s `margin: 0`. Removing the no-op utility
              now keeps the markup honest about where the spacing
              comes from. */}
          <h1 className="dq-h1 max-w-[17ch] text-balance text-[42px] leading-[1.05] tracking-[-0.018em] sm:text-[50px] lg:text-[57px]">
            The best operators drive the best yield.{" "}
            <span className="text-teal">Know where yours stand.</span>
          </h1>
          <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-foreground/85 sm:text-[19px]">
            Your property managers report on your assets. Operator IQ measures
            the managers themselves — lease-up speed, tenant retention, rent
            performance — for every operator in your market, from the listings
            they ran.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {/* Primary CTA — the sample scorecard. With no public operator
                lookup, seeing a real, complete scorecard is what creates the
                "I need this" moment; Request access is the conversion that
                follows it, so the proof path leads and sales sits second. */}
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "view_sample_scorecard" }}
              href="/sample"
              className={
                buttonVariants() +
                " h-11 bg-navy px-6 text-[14.5px] font-semibold text-white hover:bg-navy-700"
              }
            >
              See a sample scorecard →
            </TrackedLink>
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_hero", cta: "request_access" }}
              href="mailto:sales@dwellsy.com?subject=Operator%20IQ%20access"
              className="inline-flex h-11 items-center justify-center rounded-md border border-navy bg-white px-6 text-[14.5px] font-semibold text-navy transition-colors hover:bg-navy-soft"
            >
              Request access
            </TrackedLink>
          </div>
          {/* Search early, price late. An invited owner's first job is to look
              up one manager; the price for that lives far below, after the
              enterprise pitch, so nothing here anchors a five-figure
              conversation. Searching is free and lands on the teaser. */}
          <div className="mt-8 max-w-[52ch] border-t border-grid pt-6">
            <p className="text-[13px] font-semibold text-navy">
              Look up a property manager
            </p>
            <div className="mt-3">
              <ReportSearch />
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              Free. Their rating, coverage and confidence tier, without an account.
            </p>
          </div>
          <p className="mt-6 text-[14.5px] text-muted-foreground">
            Observed from Dwellsy&apos;s nationwide listing record, not
            self-reported. 30,000+ operators measured across {marketCount}{" "}
            metros.
          </p>
          <p className="mt-2 text-[13.5px] italic text-muted-foreground">
            Methodology {METHODOLOGY_VERSION} · Design {DESIGN_VERSION} · Any
            top-200 US market on request.
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
