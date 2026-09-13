import { TrackedLink } from "@/components/analytics/TrackedLink";
import { CheckoutButtons } from "@/components/report/CheckoutButtons";
import { PRODUCTS } from "@/lib/billing/products";
import { countAsWord, countAsLowerWord } from "@/lib/format-count";

// v0.34 — The consumer offer, placed LAST on the homepage by design.
//
// Ordering is the whole idea. A $149 price visible before the enterprise
// pitch anchors the enterprise conversation against it; the fix is not hiding
// the number but putting it after the reader has already met the monitoring
// system (SelectEvaluateMonitor + PerformanceAlert). By then $149 reads as
// the smaller question, not as what Operator IQ costs.
//
// Framed by INTENT ("one manager"), never as a tier of the enterprise
// product — the two differ in kind, not in volume. Three ways in: buy one
// report (funnel — a report is ABOUT an operator, so the buyer picks one
// first), buy the pack (direct checkout, no operator dependency), or start
// a conversation about unlimited access (no price — that is the system,
// not a bigger pack).
//
// Prices come from PRODUCTS so this can never drift from what Stripe charges.

export function SingleReportOffer() {
  const single = PRODUCTS.single_report;
  const pack = PRODUCTS.three_pack;

  return (
    <section className="border-t border-grid bg-white">
      <div className="mx-auto max-w-[1280px] px-6 py-16 sm:px-16">
        <div className="grid items-center gap-8 rounded-xl border border-teal/20 bg-teal-soft/40 p-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="dq-eyebrow">Not ready for a conversation</p>
            <h2 className="dq-h2 text-[24px]">One manager, one report</h2>
            <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-foreground/85">
              The full scorecard for a single operator. Web and PDF, yours to
              keep, no account needed.
            </p>
            <p className="mt-3 text-[13.5px] text-muted-foreground">
              Comparing a shortlist? {countAsWord(pack.credits)} reports for $
              {pack.priceUsd}. They don&rsquo;t expire.
            </p>
          </div>
          {/* Two ways in. A single report is ABOUT one operator, so it can't
              start a checkout here — the buyer picks the manager first, hence
              the funnel link. The pack has no operator dependency (its credits
              are redeemed later), so it starts Stripe Checkout directly. */}
          <div className="w-full sm:w-[260px] lg:justify-self-end">
            <p className="dq-tnum text-[30px] font-bold leading-none text-navy">
              ${single.priceUsd}
              <span className="ml-2 text-[13px] font-semibold text-muted-foreground">
                one report
              </span>
            </p>
            <TrackedLink
              event="pm_card_click"
              properties={{ source: "homepage_single_report_offer", cta: "look_up_manager" }}
              href="/report"
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-md bg-navy px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Look up a manager
            </TrackedLink>
            <p className="mt-4 mb-2 text-center text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              or
            </p>
            <CheckoutButtons
              offers={[
                {
                  kind: pack.kind,
                  label: `Get ${countAsLowerWord(pack.credits)} reports`,
                  priceLabel: `$${pack.priceUsd}`,
                  emphasis: "secondary",
                },
              ]}
            />
            {/* Third way in, and deliberately NOT a third price card.
                Unlimited is the monitoring system, not a larger pack — it
                differs in kind, not in volume, the same distinction this
                block's framing rests on. Pricing it here would anchor the
                enterprise conversation against $149 (the exact failure the
                section order exists to avoid) and would trip this
                component's enterprise-price guard. So it carries no number
                and opens a conversation instead, reusing the sales@ contact
                the hero and closing band already use. */}
            <div className="mt-5 border-t border-teal/20 pt-4">
              <p className="text-[13.5px] font-semibold text-foreground">
                Unlimited access
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Every operator in your markets, monitored continuously with
                alerts when something moves.
              </p>
              <TrackedLink
                event="pm_card_click"
                properties={{
                  source: "homepage_single_report_offer",
                  cta: "unlimited_access",
                }}
                href="mailto:sales@dwellsy.com?subject=Operator%20IQ%20unlimited%20access"
                className="mt-2 inline-flex items-center text-[13.5px] font-semibold text-teal underline underline-offset-4 transition-colors hover:text-teal-700"
              >
                Talk to us &rarr;
              </TrackedLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
