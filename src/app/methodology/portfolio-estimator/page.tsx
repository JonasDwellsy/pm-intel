import type { Metadata } from "next";
import Link from "next/link";

// /methodology/portfolio-estimator — standalone subpage that documents
// the v0.7 size-banded portfolio estimator. Linked from the Layer 5
// Portfolio Size widget's "How is this calculated?" affordance + the
// v0.7 changelog row on /methodology.
//
// Treatment matches the existing methodology page — generous reading
// column, tabular cohort data, explicit limitations section. No
// interactive JS; everything renders static.

export const metadata: Metadata = {
  title: "Portfolio Size Estimator — Dwellsy IQ Methodology",
  description:
    "Size-banded model that estimates total managed units per operator from observed URU activity in the Dwellsy IQ data set. Calibrated against a 70-pair operator-market sample; surfaces P25/P75 confidence bands per Dwellsy 7-cell × URU cohort.",
  alternates: { canonical: "/methodology/portfolio-estimator" },
  openGraph: {
    title: "Portfolio Size Estimator — Dwellsy IQ Methodology",
    description:
      "v0.7 size-banded portfolio estimator. Cohort multipliers, calibration sample, confidence bands, known limitations.",
    type: "article",
  },
};

interface CohortRow {
  cohort: string;
  median: number;
  p25: number;
  p75: number;
  n: number;
  confidence: "Low" | "Medium" | "High";
}

const COHORTS: CohortRow[] = [
  { cohort: "SFR Independent, URUs <100", median: 9.29, p25: 5.69, p75: 11.38, n: 12, confidence: "Low" },
  { cohort: "SFR Independent, URUs 100-299", median: 3.88, p25: 2.49, p75: 4.74, n: 29, confidence: "Medium" },
  { cohort: "SFR Independent, URUs 300+", median: 1.88, p25: 1.68, p75: 2.40, n: 6, confidence: "Low" },
  { cohort: "SFR Institutional (all)", median: 3.46, p25: 2.40, p75: 4.18, n: 4, confidence: "Low" },
  { cohort: "Hybrid (all)", median: 3.21, p25: 1.35, p75: 5.10, n: 4, confidence: "Low" },
  { cohort: "Small MF/BTR Independent (all)", median: 1.13, p25: 1.01, p75: 2.50, n: 3, confidence: "Low" },
  { cohort: "Overall fallback", median: 4.23, p25: 2.53, p75: 8.11, n: 59, confidence: "Medium" },
];

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
          The estimator answers a single question: <em>about how many units
          does this operator actually manage?</em> Dwellsy IQ observes only
          listing activity — the subset of an operator&rsquo;s portfolio
          that hits the open rental market in a given window. The estimator
          scales that observable signal up to a total-managed-units
          projection using cohort-calibrated multipliers.
        </p>

        <h2 className="mt-12 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          The size-banded model
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          For each operator we compute an annualized URU activity figure
          (T12 URUs adjusted for time-on-platform when months &lt; 12),
          look up the operator&rsquo;s cohort by Dwellsy 7-cell × URU
          band, and multiply by the cohort median to get the point
          estimate. P25 and P75 multipliers produce the confidence band.
        </p>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Cohorts are joint slices of the 7-cell taxonomy and URU
          activity. SFR Independent receives a 3-band split (under 100 /
          100-299 / 300+) because the URU-to-units ratio drops sharply
          with scale in that cohort. Other cells use single-band
          treatments because the calibration sample didn&rsquo;t justify
          further splits.
        </p>

        <h2 className="mt-10 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Cohort multipliers
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-foreground/80">
          Each row below shows the median + P25/P75 URU-to-total-units
          multipliers, the calibration sample size, and confidence tier.
          Point estimate = <span className="dq-mono">annualized URU × median</span>;
          low/high = <span className="dq-mono">annualized URU × P25 / P75</span>.
        </p>
        <table className="dq-table mt-5">
          <thead>
            <tr>
              <th>Cohort</th>
              <th className="dq-tnum text-right">Median</th>
              <th className="dq-tnum text-right">P25</th>
              <th className="dq-tnum text-right">P75</th>
              <th className="dq-tnum text-right">n</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {COHORTS.map((row) => (
              <tr key={row.cohort}>
                <td>{row.cohort}</td>
                <td className="dq-mono text-right">{row.median.toFixed(2)}</td>
                <td className="dq-mono text-right">{row.p25.toFixed(2)}</td>
                <td className="dq-mono text-right">{row.p75.toFixed(2)}</td>
                <td className="dq-mono text-right">{row.n}</td>
                <td>{row.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-12 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Calibration sample
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          The multipliers were derived from a 70-pair operator-market
          calibration set. For each calibration pair, the operator&rsquo;s
          observed T12 URU activity was paired with a verified or
          credibly-public total-managed-units figure. The ratio of
          total-units to URU produces the cohort multiplier; medians and
          quartiles were computed within each cohort to anchor the
          point estimate and confidence band.
        </p>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          The calibration analysis lives in the working file
          <span className="dq-mono">
            {" "}Dwellsy_IQ_Portfolio_Estimator_Calibration.xlsx
          </span>{" "}
          (research repo, sheet &ldquo;Size-Banded Model&rdquo;).
          Multipliers above are taken verbatim from that sheet.
        </p>

        <h2 className="mt-12 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Confidence band interpretation
        </h2>
        <ul className="mt-3 space-y-2 text-[15.5px] leading-[1.6] text-foreground/85">
          <li>
            <strong>Medium</strong> — cohort n ≥ 20. The point estimate
            is anchored on a reasonably-sized sample and the P25-P75
            band reflects real cohort variance.
          </li>
          <li>
            <strong>Low</strong> — cohort n &lt; 20. Treat as
            directional rather than exact; the band widens fast with
            small-sample medians.
          </li>
          <li>
            None of the cohorts in v0.7 reach the <strong>High</strong>{" "}
            tier (n ≥ 50 with median CV under 30%). Higher confidence
            arrives as the calibration sample grows.
          </li>
        </ul>

        <h2 className="mt-12 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Known limitations
        </h2>
        <ul className="mt-3 space-y-3 text-[15.5px] leading-[1.6] text-foreground/85">
          <li>
            <strong>Large MF/BTR — insufficient calibration data.</strong>{" "}
            The 70-pair sample didn&rsquo;t produce a defensible
            multiplier for Large MF/BTR Independent / Institutional
            operators. Those scorecards explicitly decline to estimate
            and prompt for a verified self-report via the claim flow.
            Faking a number for these operators would be more
            misleading than the explicit refusal.
          </li>
          <li>
            <strong>Mega-REIT extrapolation.</strong> Operators with
            URU activity far beyond the calibration range (e.g.
            scattered-site REITs running 1000+ T12 URUs) are
            extrapolating off the SFR Independent 300+ band rather than
            interpolating within it. Treat their estimates as the
            roughest of the bunch.
          </li>
          <li>
            <strong>Annualization assumption.</strong> Operators with
            &lt; 12 months on platform receive an annualization factor
            on their observed URUs to project a full year. This
            assumes a roughly steady listing cadence; operators in the
            middle of a portfolio ramp will be over- or under-stated.
          </li>
          <li>
            <strong>URU-to-units multipliers vary by ownership posture.</strong>{" "}
            Within a single cohort, scattered-site SFR operators
            churn more frequently than long-hold REITs of the same
            size. The cohort median averages across both; expect
            individual estimates to drift from the truth in the
            direction of the operator&rsquo;s turnover rate vs the
            cohort norm.
          </li>
          <li>
            <strong>Context only — not in ranking.</strong> The
            estimate doesn&rsquo;t feed the composite ranking or star
            assignments. It exists to give readers a back-of-envelope
            scale anchor, not a precision figure.
          </li>
        </ul>

        <h2 className="mt-12 text-[22px] font-semibold leading-[1.2] tracking-[-0.012em] text-navy">
          Operator override
        </h2>
        <p className="mt-3 text-[15.5px] leading-[1.6] text-foreground/85">
          Operators can claim their scorecard and supply a verified
          self-reported portfolio size that overrides the estimate. The
          Layer 5 widget surfaces the claim affordance on every
          insufficient-data scorecard; ranked operators with claimed
          scorecards display the verified figure with attribution
          instead of the estimate.
        </p>

        <p className="mt-12 border-t border-grid pt-5 text-[12.5px] leading-[1.5] text-muted-foreground">
          Estimator version <span className="dq-mono">v0.7-portfolio-est-v0.1</span>.
          Surfaces on scorecard Layer 5; pre-computed at seed time;
          exposed via the Ask Dwellsy IQ tools and the market brief
          generator. See the{" "}
          <Link
            href="/methodology"
            className="font-medium text-teal hover:text-teal-700 hover:underline"
          >
            full methodology
          </Link>{" "}
          for the rest of the v0.7 stack.
        </p>
      </article>
    </main>
  );
}
