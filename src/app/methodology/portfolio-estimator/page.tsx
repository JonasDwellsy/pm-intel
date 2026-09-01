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
  // `absolute` so the root template ("%s · Dwellsy IQ Markets") doesn't append and
  // double-brand ("… Dwellsy IQ Markets Methodology · Dwellsy IQ Markets").
  title: { absolute: "Portfolio Size Estimator — Dwellsy IQ Markets Methodology" },
  description:
    "How Dwellsy IQ Markets estimates an operator's total managed units from observed on-market turnover: house URUs × 3.3 + apartment URUs × 2.6, reported as a size band rather than a point estimate — and what calibration against operator-reported counts showed about the limits of any listing-derived estimate.",
  alternates: { canonical: "/methodology/portfolio-estimator" },
  openGraph: {
    title: "Portfolio Size Estimator — Dwellsy IQ Markets Methodology",
    description:
      "Unit-type turnover model, reported as a band. Includes the calibration study against operator-reported counts and why coverage — not the multipliers — is the dominant source of error.",
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
          Dwellsy IQ Markets observes only listing activity — the subset of an
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
          Why we report a band, not a number
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          The formula produces a single number, but we don&rsquo;t show you one.
          Every surface — scorecard, PDF, comparison table, rankings, export —
          reports the estimate as one of seven bands:
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[15px] leading-[1.5] text-foreground/85 sm:grid-cols-4">
          <li className="dq-mono">&lt;50</li>
          <li className="dq-mono">50–100</li>
          <li className="dq-mono">100–200</li>
          <li className="dq-mono">200–400</li>
          <li className="dq-mono">400–800</li>
          <li className="dq-mono">800–1,600</li>
          <li className="dq-mono">1,600+</li>
        </ul>
        <p className="mt-4 text-[15.5px] leading-[1.6] text-foreground/85">
          The edges are log-scaled and drawn from the actual distribution of
          estimates across the tracked book — median 170 units, 75th percentile
          331 — rather than from round numbers. They spread operators
          2.7 / 20.5 / 33.8 / 22.4 / 12.3 / 5.0 / 3.3 percent across the seven
          bands, so the discrimination sits where operators actually are. The
          bands do not overlap: every operator falls in exactly one, which is
          what lets them sort and filter without ambiguity.
        </p>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Banding is not a presentation preference. It is what the evidence
          below supports. A point estimate implies a precision this model
          cannot deliver, and stating one would be a claim we can&rsquo;t
          defend to an operator who knows their own count.
        </p>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          What calibration showed
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          We tested the estimator two ways: across the full book of 4,219
          actively-listing operators, and against operators who told us their
          own unit count directly.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.6] text-foreground/85">
          <strong>The bias is not one bias — it splits by archetype.</strong>{" "}
          Measuring declared building sizes against what we observe, a
          scattered single-family operator shows{" "}
          <strong>1.4 units per building</strong> — a house is its own building,
          so the declared figure adds nothing we didn&rsquo;t already see. An
          apartment-heavy operator shows <strong>37.4</strong>, because one
          observed listing stands for a whole property. Declared unit counts are
          therefore an informative size signal only for apartment operators, and
          those are exactly the operators the turnover model handles worst.
        </p>
        <p className="mt-4 text-[15.5px] leading-[1.6] text-foreground/85">
          Against operator-reported counts, both apartment-heavy:
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[14.5px]">
            <thead>
              <tr className="border-b border-grid text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Signal</th>
                <th className="py-2 pr-4 font-semibold text-right">
                  Operator A (78% apt)
                </th>
                <th className="py-2 font-semibold text-right">
                  Operator B (100% apt)
                </th>
              </tr>
            </thead>
            <tbody className="text-foreground/85">
              <tr className="border-b border-grid/60">
                <td className="py-2 pr-4">Operator reports</td>
                <td className="dq-mono py-2 pr-4 text-right">1,400</td>
                <td className="dq-mono py-2 text-right">3,000</td>
              </tr>
              <tr className="border-b border-grid/60">
                <td className="py-2 pr-4">Units observed (T12)</td>
                <td className="dq-mono py-2 pr-4 text-right">287</td>
                <td className="dq-mono py-2 text-right">309</td>
              </tr>
              <tr className="border-b border-grid/60">
                <td className="py-2 pr-4">Units observed (lifetime)</td>
                <td className="dq-mono py-2 pr-4 text-right">502</td>
                <td className="dq-mono py-2 text-right">1,334</td>
              </tr>
              <tr className="border-b border-grid/60">
                <td className="py-2 pr-4">Declared building units</td>
                <td className="dq-mono py-2 pr-4 text-right">898</td>
                <td className="dq-mono py-2 text-right">1,500</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Our estimate</td>
                <td className="dq-mono py-2 pr-4 text-right">790</td>
                <td className="dq-mono py-2 text-right">803</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[15.5px] leading-[1.6] text-foreground/85">
          The decisive result is the last two rows.{" "}
          <strong>
            Even the strongest signal we hold is roughly half the reported
            count, on both operators.
          </strong>{" "}
          That residual is not a multiplier that needs tuning. It is{" "}
          <strong>coverage</strong> — units that never list with Dwellsy at all,
          because they sit with long-staying tenants, lease through channels we
          don&rsquo;t see, or belong to a portfolio the operator only partly
          markets publicly. No multiplier recovers a unit that was never
          observable.
        </p>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          So the honest reading of any listing-derived size estimate, ours
          included, is a <strong>floor rather than a census</strong>. We say so
          on every surface that shows one.
        </p>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          We have deliberately <em>not</em> recalibrated the multipliers on this
          evidence. Two ground-truth points, both apartment-heavy, cannot
          justify moving a number that also governs the ~900 scattered-house
          operators for whom we hold no validated count at all. Tuning to n=2
          would replace a known bias with an unmeasured one. We are collecting
          more reported counts and will revisit when there are enough to
          separate archetypes.
        </p>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Turnover uncertainty, separately
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Turnover rates aren&rsquo;t exact either. Plausible low and high
          multipliers bracket the defaults — houses roughly 2.5–4.2, apartments
          roughly 2.0–3.3:
        </p>
        <div className="mt-4">
          <FormulaBlock label="Formula · turnover range">
            <span className="text-navy">low</span> <Op>=</Op> house URUs{" "}
            <Op>×</Op> 2.5 <Op>+</Op> apartment URUs <Op>×</Op> 2.0
            <br />
            <span className="text-navy">high</span> <Op>=</Op> house URUs{" "}
            <Op>×</Op> 4.2 <Op>+</Op> apartment URUs <Op>×</Op> 3.3
          </FormulaBlock>
        </div>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          This range is type-aware, and it drives the shaded region on the
          scorecard&rsquo;s size bar. It is worth being precise about what it
          does <em>not</em> represent: it captures variation in how fast units
          turn over, not the coverage gap above. The coverage gap is larger, and
          it runs in one direction — down. Read the shaded region as the
          model&rsquo;s internal uncertainty, not as a claim about how close the
          estimate is to the truth.
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
            <strong>Coverage is the big one, and it only runs one way.</strong>{" "}
            We can scale what we observe; we cannot scale what never listed. On
            both operators we have checked against a reported count, the gap
            after every available signal was roughly 2×, and it was always in
            the same direction — we were low. Treat the estimate as a floor.
            This limitation is structural, not a bug we intend to fix, because
            no model can recover a unit it never saw.
          </li>
          <li>
            <strong>Apartment-heavy operators are understated the most.</strong>{" "}
            A single observed listing can stand for a large building. The
            turnover model scales that one listing by 2.6, which is right for
            one unit and badly short for a property.
          </li>
          <li>
            <strong>Mixed-type edge case.</strong> A lone apartment or condo
            held by an otherwise-scattered single-family operator gets the
            faster apartment multiplier even though it likely turns over slowly.
            This is a second-order effect on operators whose portfolio is
            overwhelmingly one type.
          </li>
          <li>
            <strong>Turnover drift.</strong> The multipliers are population
            averages. An operator that turns over faster or slower than the norm
            will be over- or under-stated in that direction; the turnover range
            absorbs ordinary variation, not extremes.
          </li>
          <li>
            <strong>Context only — not in ranking.</strong> The estimate never
            feeds the composite or star assignments. It exists to give readers a
            scale anchor, not a precision figure.
          </li>
        </ul>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Operator-reported counts
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          When an operator tells us their own unit count, we record it — dated,
          attributed to how we heard it, and kept alongside what we observe.
        </p>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          <strong>It does not change anything you see.</strong> A reported count
          never replaces the estimate, never moves the size band, and never
          enters cohorts, peer sets, or rankings. Every operator on Dwellsy IQ Markets
          is measured on the same observed basis, whether or not we have ever
          spoken to them — the moment that stops being true, no two operators
          are comparable.
        </p>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Reported counts exist to be the yardstick the estimator is measured
          against. A number folded into the estimate can no longer check it.
        </p>

        <p className="mt-12 border-t border-grid pt-5 text-[12.5px] leading-[1.5] text-muted-foreground">
          Estimator version{" "}
          <span className="dq-mono">v0.8-house-apt-turnover</span>. Computed at
          seed time and surfaced on the scorecard; also available through the
          Ask Dwellsy IQ Markets tools and the market-brief generator. See the{" "}
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
