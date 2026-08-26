// v0.30 — Consumer teaser shown when a visitor hasn't bought access to an
// operator's report. Server component; the only client island is the checkout
// button row. Shows free identity + coverage + star COUNTS (already public in
// search) and the confidence tier, locks the premium payload, and offers the
// two purchase paths. Reuses the raw ScorecardData (no view leak of premium
// values into the DOM).

import Link from "next/link";
import type { ScorecardData } from "@/lib/types";
import { countOperatorStars } from "@/lib/operators/stars";
import type { ReportTierInfo } from "@/lib/report/confidence-tier";
import { ConfidenceBadge } from "@/components/report/ConfidenceBadge";
import { CheckoutButtons } from "@/components/report/CheckoutButtons";

const LOCKED_ROWS = [
  "Overall peer rank & percentiles",
  "Lease-up speed vs local peers",
  "Tenant retention",
  "Rent performance vs market",
  "Marketing & listing quality",
];

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

  return (
    <main className="bg-[#FBFAF6]">
      <div className="mx-auto max-w-[860px] px-6 py-10">
        {/* Identity header (free) */}
        <div className="rounded-xl border border-grid bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <ConfidenceBadge info={tierInfo} />
              <h1 className="mt-3 text-[26px] font-semibold leading-tight text-navy">
                {name}
              </h1>
              <p className="mt-1 text-[15px] text-muted-foreground">
                {type} · {marketName}
              </p>
            </div>
            {(goldCount > 0 || silverCount > 0) && (
              <div className="shrink-0 rounded-lg bg-navy-soft px-4 py-3 text-right">
                <p className="text-[13px] font-medium text-navy">
                  {goldCount > 0 && <span>★ {goldCount} gold</span>}
                  {goldCount > 0 && silverCount > 0 && " · "}
                  {silverCount > 0 && <span>{silverCount} silver</span>}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  across 5 measures
                </p>
              </div>
            )}
          </div>

          {/* Free coverage strip */}
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-grid pt-5 sm:grid-cols-4">
            <Stat label="Listings (12 mo)" value={cov.t12Listings?.toLocaleString() ?? "—"} />
            <Stat label="Cities observed" value={String(cov.citiesObserved ?? "—")} />
            <Stat
              label="Communities"
              value={cov.observedCommunities != null ? String(cov.observedCommunities) : "—"}
            />
            <Stat
              label="Months tracked"
              value={cov.monthsOnPlatform != null ? String(cov.monthsOnPlatform) : "—"}
            />
          </dl>

          <p className="mt-4 max-w-[60ch] text-[13px] leading-snug text-muted-foreground">
            {tierInfo.blurb}
          </p>
        </div>

        {/* Locked premium + purchase */}
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-grid bg-white p-6">
            <p className="dq-eyebrow text-teal">In the full report</p>
            <ul className="mt-4 space-y-3">
              {LOCKED_ROWS.map((row) => (
                <li
                  key={row}
                  className="flex items-center justify-between gap-3 border-b border-grid/60 pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-[14px] text-foreground/85">{row}</span>
                  <span
                    aria-hidden
                    className="inline-flex select-none items-center rounded bg-slate-100 px-6 py-1 text-slate-300"
                  >
                    ▓▓▓
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
              The full scorecard shows exactly where {name} ranks against local
              peers on lease-up speed, tenant retention, rent performance, and
              listing quality — the signals that tell you whether they&rsquo;ll
              keep your property rented and your tenants happy.
            </p>
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
                    sub: "Full scorecard + PDF, yours to keep.",
                  },
                  {
                    kind: "market_pass",
                    label: "Compare the whole market",
                    priceLabel: "$49",
                    sub: `Every operator in ${marketName} for 30 days.`,
                  },
                ]}
              />
            </div>
            <p className="mt-4 text-[12px] leading-snug text-muted-foreground">
              Independent, data-driven, and not paid for by property managers.{" "}
              <Link href="/methodology" className="text-teal underline-offset-2 hover:underline">
                How we measure
              </Link>
              .
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-[18px] font-semibold text-navy">{value}</dd>
    </div>
  );
}
