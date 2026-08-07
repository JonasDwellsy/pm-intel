import { TrackedLink } from "@/components/analytics/TrackedLink";

// Closing band. Same two CTAs as the hero, in the same order (proof first,
// sales second) so a visitor who scrolled the whole page lands on the identical
// next step rather than a new one.

export function FinalCta() {
  return (
    <section className="border-t border-grid bg-navy">
      <div className="mx-auto max-w-[1280px] px-6 py-20 text-center sm:px-16 lg:py-24">
        <h2 className="dq-h2 mx-auto max-w-[20ch] text-balance text-[30px] leading-[1.12] tracking-[-0.018em] text-white sm:text-[38px]">
          See how your operators compare.
        </h2>
        <p className="mx-auto mt-5 max-w-[56ch] text-[17px] leading-[1.55] text-white/75">
          Independent, market-observed performance on the companies running your
          assets.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <TrackedLink
            event="pm_card_click"
            properties={{ source: "homepage_final_cta", cta: "view_sample_scorecard" }}
            href="/sample"
            className="inline-flex h-11 items-center justify-center rounded-md bg-teal px-6 text-[14.5px] font-semibold text-white transition-colors hover:bg-teal-700"
          >
            See a sample scorecard →
          </TrackedLink>
          <TrackedLink
            event="pm_card_click"
            properties={{ source: "homepage_final_cta", cta: "request_access" }}
            href="mailto:sales@dwellsy.com?subject=Operator%20IQ%20access"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/35 px-6 text-[14.5px] font-semibold text-white transition-colors hover:border-white"
          >
            Request access
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
