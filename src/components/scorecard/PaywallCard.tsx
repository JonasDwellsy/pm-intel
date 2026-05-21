import { PaywallViewTracker } from "@/components/analytics/PaywallViewTracker";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import type { ScorecardData } from "@/lib/types";

const SECTIONS_IN_FULL_VIEW: Array<{ num: string; title: string; sub: string }> = [
  { num: "02", title: "Coverage universe", sub: "What we observe and the sample backing every figure" },
  { num: "03", title: "Geographic coverage", sub: "Where the portfolio sits in the MSA" },
  { num: "04", title: "Operating performance", sub: "DOM by asset class, vs peer quadrant and market" },
  { num: "05", title: "Tenancy", sub: "Episode-clustered gaps vs cohort p25–p75" },
  { num: "06", title: "Rent trajectory", sub: "Six-quarter mix-adjusted median rent" },
  { num: "07", title: "Rent performance", sub: "YoY rent change vs MSA cohort median" },
  { num: "08", title: "Marketing quality", sub: "Completeness, amenities, description depth" },
  { num: "09", title: "Community visibility", sub: "MF/BTR cherry-picking signal (when applicable)" },
  { num: "10", title: "Why this quadrant", sub: "Full classification rationale" },
];

export function PaywallCard({ scorecard }: { scorecard: ScorecardData }) {
  const unlockHref = `?unlocked=true`;
  return (
    <section id="paywall" className="dq-section">
      <PaywallViewTracker
        targetId="paywall"
        properties={{
          pmSlug: scorecard.pm.slug,
          marketId: scorecard.market.id,
        }}
      />
      <div className="relative overflow-hidden rounded-lg border-2 border-orange/40 bg-white">
        <div className="absolute inset-x-0 top-0 h-1 bg-orange" />
        <div className="grid gap-10 px-8 py-10 md:grid-cols-[1fr_360px]">
          <div>
            <p className="dq-eyebrow" style={{ color: "#B85F22" }}>
              Paywalled · Full scorecard
            </p>
            <h2 className="dq-h2 mt-2">
              Unlock the full scorecard for {scorecard.pm.name}
            </h2>
            <p className="mt-3 max-w-[560px] text-[15px] text-muted-foreground">
              Everything below the headline metrics is paywalled. The full
              report includes nine analytical sections plus a watermarked PDF
              export, methodology references, and shareable links.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <TrackedLink
                event="paywall_cta_click"
                properties={{ pmSlug: scorecard.pm.slug, action: "unlock" }}
                href={unlockHref}
                className="inline-flex h-11 items-center justify-center rounded-md bg-orange px-6 text-[14px] font-semibold text-white transition-colors hover:bg-orange-700"
              >
                Unlock full scorecard
              </TrackedLink>
              <TrackedLink
                event="paywall_cta_click"
                properties={{ pmSlug: scorecard.pm.slug, action: "build_buy_box" }}
                href="/buy-boxes/new"
                className="inline-flex h-11 items-center justify-center rounded-md border border-navy bg-white px-6 text-[14px] font-semibold text-navy transition-colors hover:bg-navy-soft"
              >
                Build a buy box to find more like this
              </TrackedLink>
            </div>

            <p className="mt-6 text-[12px] text-muted-2">
              Local dev: paywall is toggled by{" "}
              <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-[11px] text-navy">
                ?unlocked=true
              </code>{" "}
              in the URL. Real auth lands in Journey 3.
            </p>
          </div>

          <ul className="space-y-2 rounded-md bg-surface-soft p-5">
            {SECTIONS_IN_FULL_VIEW.map((s) => (
              <li
                key={s.num}
                className="grid grid-cols-[28px_minmax(0,1fr)] items-baseline gap-2 text-[13px]"
              >
                <span className="dq-mono text-[10px] font-medium text-muted-2">
                  {s.num}
                </span>
                <span>
                  <span className="font-semibold text-navy">{s.title}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {s.sub}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
