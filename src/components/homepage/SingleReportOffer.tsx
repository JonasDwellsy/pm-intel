import { TrackedLink } from "@/components/analytics/TrackedLink";
import { PRODUCTS } from "@/lib/billing/products";
import { countAsWord } from "@/lib/format-count";

// v0.34 — The consumer offer, placed LAST on the homepage by design.
//
// Ordering is the whole idea. A $149 price visible before the enterprise
// pitch anchors the enterprise conversation against it; the fix is not hiding
// the number but putting it after the reader has already met the monitoring
// system (SelectEvaluateMonitor + PerformanceAlert). By then $149 reads as
// the smaller question, not as what Operator IQ costs.
//
// Framed by INTENT ("one manager"), never as a tier of the enterprise
// product — the two differ in kind, not in volume.
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
          <div className="lg:text-right">
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
              className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-navy px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Look up a manager
            </TrackedLink>
          </div>
        </div>
      </div>
    </section>
  );
}
