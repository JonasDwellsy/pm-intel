import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PaywallViewTracker } from "@/components/analytics/PaywallViewTracker";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import type { ScorecardData } from "@/lib/types";

const SECTIONS_IN_FULL_VIEW = [
  "Coverage & data tier — what we observe and how complete it is",
  "Performance — DOM by asset class, vs peer quadrant and market",
  "Five-year time context — how this PM's leasing velocity has tracked the market",
  "Rent trajectory — premium / discount vs comparable units, year by year",
  "Pricing — concession rate, premium distribution",
  "Listing quality — completeness, amenities, description depth",
  "Coverage confidence — observed vs expected listing intensity",
  "Tenancy retention — months held vs cohort medians",
  "Why this quadrant — full classification rationale",
];

export function PaywallCard({ scorecard }: { scorecard: ScorecardData }) {
  const unlockHref = `?unlocked=true`;
  return (
    <Card id="paywall" className="border-2">
      <CardHeader>
        <CardTitle className="text-2xl">
          Unlock the full scorecard for {scorecard.pm.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Everything below the headline metrics is paywalled. The full report
          includes:
        </p>
        <ul className="space-y-2 text-sm">
          {SECTIONS_IN_FULL_VIEW.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-muted-foreground">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <TrackedLink
            event="paywall_cta_click"
            properties={{ pmSlug: scorecard.pm.slug, action: "unlock" }}
            href={unlockHref}
            className={buttonVariants({ size: "lg" })}
          >
            Unlock full scorecard
          </TrackedLink>
          <TrackedLink
            event="paywall_cta_click"
            properties={{ pmSlug: scorecard.pm.slug, action: "get_matched" }}
            href="/get-matched"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Get matched to a PM in your market
          </TrackedLink>
        </div>
        <PaywallViewTracker
          targetId="paywall"
          properties={{
            pmSlug: scorecard.pm.slug,
            marketId: scorecard.market.id,
          }}
        />
        <p className="text-xs text-muted-foreground">
          Local dev: paywall is toggled by{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">?unlocked=true</code>
          {" "}in the URL. Real auth lands in Journey 3.
        </p>
      </CardContent>
    </Card>
  );
}
