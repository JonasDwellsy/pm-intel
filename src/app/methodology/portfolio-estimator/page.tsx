import type { Metadata } from "next";
import Link from "next/link";
import { FormulaBlock, Op } from "@/components/methodology/FormulaBlock";

// /methodology/portfolio-estimator — standalone subpage documenting the
// v0.8 unit-type turnover portfolio estimator. Linked from the scorecard
// Portfolio Size widget's "How is this calculated?" affordance + the v0.7
// methodology changelog row on /methodology.
//
// Treatment matches the main methodology page — generous reading column,
// explicit limitations section, no interactive JS; everything renders static.

export const metadata: Metadata = {
  // `absolute` so the root template ("%s · Operator IQ") doesn't append and
  // double-brand ("… Operator IQ Methodology · Operator IQ").
  title: { absolute: "Portfolio Size Estimator — Operator IQ Methodology" },
  description:
    "How Operator IQ estimates an operator's total managed units from observed on-market turnover: house URUs × 3.3 + apartment URUs × 2.6, applied uniformly with admin-tunable multipliers and a low–high confidence band.",
  alternates: { canonical: "/methodology/portfolio-estimator" },
  openGraph: {
    title: "Portfolio Size Estimator — Operator IQ Methodology",
    description:
      "Unit-type turnover model: house and apartment URUs scaled to estimated managed units, with a plausible-turnover confidence band and known limitations.",
    type: "article",
  },
};

export default function PortfolioEstimatorPage() {
  return (
    <main className="bg-white">
      <article className="mx-auto max-w-[760px] px-6 py-14 sm:py-20">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <Link href="/methodology" className="hover:text-navy">
            Methodology
          </Link>
          <span className="text-muted-2">/</span>
          <span>Portfolio Size Estimator</span>
        </nav>

        <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
          Methodology · v0.7
        </p>
        <h1 className="mt-2 text-[34px] font-semibold leading-[1.15] tracking-[-0.014em] text-navy sm:text-[40px]">
          Portfolio Size Estimator
        </h1>
        <p className="mt-4 text-[16.5px] leading-[1.65] text-foreground/85">
          The estimator answers a single question:{" "}
          <em>about how many units does this operator actually manage?</em>{" "}
          Operator IQ observes only listing activity — the subset of an
          operator&rsquo;s portfolio that hits the open rental market in a given
          window. A unit only appears when it lists, and it only lists on
          turnover, so observed units are a fraction of the managed book. The
          estimator scales that observable signal back up.
        </p>

        <h2 className="mt-12 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          The model
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          The key idea is that turnover differs by unit type. A scattered
          single-family house re-lists roughly every 3.3 years; an apartment
          unit turns over faster, roughly every 2.6 years. So each observed
          unit is scaled by a multiplier keyed to its own type, and the two are
          summed:
        </p>
        <div className="mt-4">
          <FormulaBlock label="Formula · estimated managed units">
            <span className="text-navy">estimated_units</span> <Op>=</Op> house
            URUs (T12) <Op>×</Op> 3.3 <Op>+</Op> apartment URUs (T12){" "}
            <Op>×</Op> 2.6
          </FormulaBlock>
        </div>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          The two multipliers are applied <strong>uniformly to every
          operator</strong>, keyed on each unit&rsquo;s own observed type — not
          on the operator&rsquo;s dominant-type label and not on building-level
          dominance. For a genuine apartment operator, apartment URUs × 2.6
          reproduces the declared building count without ever attributing a
          whole building from a single listing. The multipliers are stored as
          admin settings (<span className="dq-mono">portfolio_k_house</span>,{" "}
          <span className="dq-mono">portfolio_k_apt</span>) and applied at seed
          time, so a change takes effect on the next data refresh.
        </p>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Confidence band
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Turnover rates aren&rsquo;t exact, so the estimate is a range rather
          than a single number. Plausible low and high turnover multipliers
          bracket the defaults — houses roughly 2.5–4.2, apartments roughly
          2.0–3.3:
        </p>
        <div className="mt-4">
          <FormulaBlock label="Formula · confidence band">
            <span className="text-navy">low</span> <Op>=</Op> house URUs{" "}
            <Op>×</Op> 2.5 <Op>+</Op> apartment URUs <Op>×</Op> 2.0
            <br />
            <span className="text-navy">high</span> <Op>=</Op> house URUs{" "}
            <Op>×</Op> 4.2 <Op>+</Op> apartment URUs <Op>×</Op> 3.3
          </FormulaBlock>
        </div>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          The band is type-aware: an apartment-heavy operator&rsquo;s band
          reflects apartment-turnover uncertainty, a house-heavy
          operator&rsquo;s reflects house-turnover uncertainty. The point
          estimate always sits inside the displayed range.
        </p>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          When we don&rsquo;t estimate
        </h2>
        <ul className="mt-3 space-y-2 text-[15.5px] leading-[1.6] text-foreground/85">
          <li>
            <strong>No listings</strong> — an operator with zero observed units
            in the trailing 12 months gets no estimate.
          </li>
          <li>
            <strong>Too little history</strong> — under three months of
            observation is too short to project; the scorecard shows the
            observed count without an estimate.
          </li>
          <li>
            <strong>No typed units</strong> — if no observed unit can be
            classified as a house or an apartment, there is nothing to scale.
          </li>
        </ul>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Unlike the earlier cohort-banded model, there is no
          &ldquo;insufficient calibration data&rdquo; refusal for large
          multifamily operators — every operator with typed trailing-12-month
          units is estimated on the same uniform formula.
        </p>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Known limitations
        </h2>
        <ul className="mt-3 space-y-3 text-[15.5px] leading-[1.6] text-foreground/85">
          <li>
            <strong>Mixed-type edge case.</strong> A lone apartment or condo
            held by an otherwise-scattered single-family operator gets the
            faster apartment multiplier even though it likely turns over slowly.
            This is a second-order effect on operators whose portfolio is
            overwhelmingly one type.
          </li>
          <li>
            <strong>Invisible long-hold units.</strong> A unit under a
            long-staying tenant that never re-lists in the window is invisible
            to any listing-based estimate — the model can only scale what it
            observes.
          </li>
          <li>
            <strong>Turnover drift.</strong> The multipliers are population
            averages. An operator that turns over faster or slower than the norm
            will be over- or under-stated in that direction; the confidence band
            is meant to absorb ordinary variation, not extremes.
          </li>
          <li>
            <strong>Context only — not in ranking.</strong> The estimate never
            feeds the composite or star assignments. It exists to give readers a
            back-of-envelope scale anchor, not a precision figure.
          </li>
        </ul>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Operator override
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Operators can claim their scorecard and supply a verified
          self-reported portfolio size, which is displayed with attribution in
          place of the estimate.
        </p>

        <p className="mt-12 border-t border-grid pt-5 text-[12.5px] leading-[1.5] text-muted-foreground">
          Estimator version{" "}
          <span className="dq-mono">v0.8-house-apt-turnover</span>. Computed at
          seed time and surfaced on the scorecard; also available through the
          Ask Operator IQ tools and the market-brief generator. See the{" "}
          <Link
            href="/methodology"
            className="font-medium text-teal hover:text-teal-700 hover:underline"
          >
            full methodology
          </Link>{" "}
          for the rest of the stack.
        </p>
      </article>
    </main>
  );
}
