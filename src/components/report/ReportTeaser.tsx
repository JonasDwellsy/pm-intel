// v0.34 — Consumer teaser shown when a visitor hasn't bought a report. Server
// component; the only client island is the checkout button row. Frames the
// buy decision: a strong hook, the (public) star result, a clearly-locked and
// value-teased list of what the paid report reveals, a link to a live sample,
// and the two purchase paths. Never leaks premium metric VALUES into the DOM.

import Link from "next/link";
import type { ScorecardData } from "@/lib/types";
import { countOperatorStars } from "@/lib/operators/stars";
import type { ReportTierInfo } from "@/lib/report/confidence-tier";
import { ConfidenceBadge } from "@/components/report/ConfidenceBadge";
import { CheckoutButtons } from "@/components/report/CheckoutButtons";

// Each locked row: the measure, and a plain-English line on what the buyer
// learns from it. The value tease is what makes the lock feel worth opening.
const LOCKED_ROWS: Array<{ title: string; tease: string }> = [
  { title: "Overall standing", tease: "Where they rank among every scored manager in this market" },
  { title: "Lease-up speed", tease: "How fast they fill a vacancy versus the local median" },
  { title: "Tenant retention", tease: "How long tenants stay before they turn over" },
  { title: "Rent performance", tease: "Whether their rents beat or trail the market" },
  { title: "Listing quality", tease: "How well they photograph, describe, and fill a listing" },
];

function LockIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ReportTeaser({
  scorecard,
  tierInfo,
  partner,
}: {
  scorecard: ScorecardData;
  tierInfo: ReportTierInfo;
  partner?: string | null;
}) {
  const { goldCount, silverCount } = countOperatorStars(scorecard);
  const name = scorecard.pm.name;
  const marketName = scorecard.market.fullName;
  const type = scorecard.pm.quadrant7Cell || scorecard.pm.quadrant;
  const cov = scorecard.coverage;
  const hasStars = goldCount > 0 || silverCount > 0;
  const starPhrase = [
    goldCount > 0 ? `${goldCount} gold` : null,
    silverCount > 0 ? `${silverCount} silver` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const coverageBits = [
    cov.t12Listings ? `${cov.t12Listings.toLocaleString()} listings in the past year` : null,
    cov.citiesObserved ? `${cov.citiesObserved} ${cov.citiesObserved === 1 ? "city" : "cities"}` : null,
    cov.monthsOnPlatform ? `tracked ${cov.monthsOnPlatform} months` : null,
  ].filter(Boolean);

  return (
    <main className="bg-[#FBFAF6]">
      <div className="mx-auto max-w-[900px] px-6 py-10">
        {/* Hook + identity */}
        <div className="rounded-xl border border-grid bg-white p-6 sm:p-8">
          <ConfidenceBadge info={tierInfo} />
          <h1 className="mt-3 text-[28px] font-semibold leading-tight text-navy sm:text-[32px]">
            {name}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {type} · {marketName}
          </p>

          <p className="mt-5 max-w-[60ch] text-[16px] leading-relaxed text-foreground/90">
            Choosing a property manager is a high-stakes call. This report shows
            how {name} actually performs against every scored manager in{" "}
            {scorecard.market.name}, on the things that decide whether your
            property stays rented and profitable.
          </p>

          {hasStars && (
            <div className="mt-5 flex items-start gap-3 rounded-lg bg-navy-soft px-4 py-3">
              <span className="mt-0.5 text-[18px] leading-none text-navy">★</span>
              <p className="text-[14px] leading-snug text-navy">
                {name} earned <span className="font-semibold">{starPhrase}</span>{" "}
                {goldCount + silverCount === 1 ? "star" : "stars"} across our five
                performance measures. The full report shows which ones, and where
                they fall short.
              </p>
            </div>
          )}

          {coverageBits.length > 0 && (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              {coverageBits.join(" · ")}
            </p>
          )}

          <Link
            href="/sample"
            className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-teal underline-offset-2 hover:underline"
          >
            See a sample report
            <span aria-hidden>→</span>
          </Link>
        </div>

        {/* Locked report contents + purchase */}
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_330px]">
          <div className="rounded-xl border border-grid bg-white p-6 sm:p-7">
            <p className="dq-eyebrow text-teal">Locked · unlock for $29</p>
            <h2 className="mt-1 text-[17px] font-semibold text-navy">
              What the full report shows you
            </h2>
            <ul className="mt-5 divide-y divide-grid/70">
              {LOCKED_ROWS.map((row) => (
                <li key={row.title} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-medium text-navy">{row.title}</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                      {row.tease}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                    <LockIcon />
                    Locked
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <aside className="rounded-xl border border-navy/15 bg-white p-6 shadow-sm">
            <p className="text-[13px] font-medium text-muted-foreground">
              Make the call with data
            </p>
            <div className="mt-4">
              <CheckoutButtons
                pmSlug={scorecard.pm.slug}
                marketId={scorecard.market.id}
                partner={partner}
                offers={[
                  {
                    kind: "single_report",
                    label: "Get this report",
                    priceLabel: "$29",
                    sub: "The full scorecard, plus a PDF to keep.",
                  },
                  {
                    kind: "market_pass",
                    label: "Compare the whole market",
                    priceLabel: "$49",
                    sub: `Every scored manager in ${scorecard.market.name} for 30 days.`,
                  },
                ]}
              />
            </div>
            <p className="mt-4 text-[12px] leading-snug text-muted-foreground">
              Independent and data-driven. We are not paid by the managers we
              rate.{" "}
              <Link href="/methodology" className="text-teal underline-offset-2 hover:underline">
                How we measure
              </Link>
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
