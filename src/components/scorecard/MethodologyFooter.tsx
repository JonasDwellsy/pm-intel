import Link from "next/link";
import type { ScorecardData } from "@/lib/types";
import { fmtDate, fmtInt, fmtPct } from "@/lib/format";
import { LayerSectionHeader } from "@/components/scorecard/LayerSectionHeader";

// Layer 6A — Methodology footer (Scorecard_Design_Spec_v1.0.md Section 3,
// Layer 6). Quiet, small-text section at the bottom of the scorecard.
// Subsumes the v0.6.1 CoverageSection ("Coverage universe" table) and
// WhyThisQuadrantSection (classification rationale prose); adds the v1.0
// methodology surface elements:
//
//   - Classification rationale
//   - Coverage universe table (parameters + portfolio composition)
//   - Sample sizes per metric (compact table)
//   - Version stamp + data refresh date
//   - Disclaimer
//   - Citation suggestion
//   - Methodology page link
//
// Designed as a single quiet block — readers who need methodology depth
// land here; everyone else scrolls past.

export function MethodologyFooter({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const c = scorecard.coverage;
  const t = scorecard.tenancy;

  // Compose per-metric sample size rows. Some metrics have direct N counts
  // (DOM, marketing); others use unit counts as proxy for sample scope.
  const sampleRows: Array<{ metric: string; n: string; note?: string }> = [
    {
      metric: "Lease-up Performance (DOM)",
      n: fmtInt(scorecard.performance.domT12N),
      note: "T12 leased listings",
    },
    {
      metric: "Tenant Retention",
      n: fmtInt(t.multiEpisodeUnits),
      note: `multi-episode units (${t.multiEpisodePct}% of ${fmtInt(t.totalUnits)} observed)`,
    },
    {
      metric: "Rent Performance",
      n: fmtInt(c.urusT12),
      note: "T12 observed urus feeding mix-adjusted YoY",
    },
    {
      metric: "Operational Discipline",
      n: fmtInt(c.t12Listings),
      note: "T12 listings scored",
    },
  ];
  if (scorecard.communityVisibility) {
    sampleRows.push({
      metric: "Inventory Transparency",
      n: fmtInt(scorecard.communityVisibility.perCommunity.length),
      note: "concentrated communities backing the ratio",
    });
  }

  return (
    <section
      id="methodology-footer"
      aria-label="Methodology and limits"
      className="dq-section border-t border-grid pt-10"
    >
      <LayerSectionHeader
        num="05"
        title="Methodology & limits"
        lede="What backs this scorecard — classification rationale, coverage universe, per-metric sample sizes, version stamp, and the v0.7 follow-up tracker."
      />

      {/* Classification rationale (subsumes WhyThisQuadrantSection prose). */}
      {scorecard.classificationRationale && (
        <div className="mt-6 max-w-[820px]">
          <p className="dq-eyebrow-muted mb-2">Classification rationale</p>
          <p className="text-[14px] leading-[1.65] text-foreground text-pretty">
            {scorecard.classificationRationale}
          </p>
        </div>
      )}

      {/* Coverage universe table (subsumes CoverageSection). */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <CoverageParameters scorecard={scorecard} />
        <PortfolioComposition scorecard={scorecard} />
      </div>

      {/* Sample sizes per metric */}
      <div className="mt-8">
        <p className="dq-eyebrow-muted mb-2">Sample sizes per metric</p>
        <table className="dq-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="num">N</th>
              <th>Backing</th>
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td className="num">{row.n}</td>
                <td className="text-muted-foreground">{row.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Version + refresh + link */}
      <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <div className="rounded-md border border-grid bg-surface-soft p-5">
          <p className="dq-eyebrow-muted mb-2">Disclaimer</p>
          <p className="text-[13px] leading-[1.6] text-foreground">
            Dwellsy IQ scorecards reflect operator behavior observable in our
            first-party listings data. Figures are not portfolio totals;
            they&rsquo;re what we see. Composite is descriptive, not
            predictive — it doesn&rsquo;t forecast underwriting outcomes.
            Operators with shorter observation history have noisier estimates
            on metrics that depend on multi-episode unit pairs (Tenancy) or
            multi-year trajectory (Rent Stability). See the methodology page
            for full caveats.
          </p>
        </div>
        <div className="rounded-md border border-grid bg-white p-5">
          <p className="dq-eyebrow-muted mb-2">Version &amp; refresh</p>
          <p className="dq-mono text-[13px] leading-[1.6] text-navy">
            Methodology v{scorecard.methodologyVersion.replace(/^v/, "")}
            {scorecard.designVersion && (
              <>
                <br />Design {scorecard.designVersion}
              </>
            )}
            <br />
            Data as of{" "}
            <span className="font-semibold">{fmtDate(scorecard.dataAsOf)}</span>
          </p>
          <Link
            href="/methodology"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal transition-colors hover:text-teal-700"
          >
            Full methodology
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Citation suggestion */}
      <div className="mt-8 max-w-[820px]">
        <p className="dq-eyebrow-muted mb-2">Suggested citation</p>
        <p className="dq-mono text-[12.5px] leading-[1.55] text-navy">
          Dwellsy IQ, 2026.{" "}
          <em>
            PM Intel Scorecard for {scorecard.pm.name} ({scorecard.market.name}
            ).
          </em>{" "}
          Methodology v{scorecard.methodologyVersion.replace(/^v/, "")}
          {scorecard.designVersion ? ` · Design ${scorecard.designVersion}` : ""}
          . iq.dwellsy.com/property-managers/{scorecard.pm.slug}
        </p>
      </div>
    </section>
  );
}

// --- Sub-blocks (subsumed from CoverageSection) ---

function CoverageParameters({ scorecard }: { scorecard: ScorecardData }) {
  const c = scorecard.coverage;
  return (
    <div>
      <p className="dq-eyebrow-muted mb-2">Coverage parameters</p>
      <table className="dq-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>First observed listing</td>
            <td className="num">{fmtDate(c.firstListing)}</td>
          </tr>
          <tr>
            <td>Months on platform</td>
            <td className="num">{fmtInt(c.monthsOnPlatform)}</td>
          </tr>
          <tr>
            <td>Listings — lifetime</td>
            <td className="num">{fmtInt(c.lifetimeListings)}</td>
          </tr>
          <tr>
            <td>Listings — T12</td>
            <td className="num">{fmtInt(c.t12Listings)}</td>
          </tr>
          {c.t6Listings !== null && (
            <tr>
              <td>Listings — T6</td>
              <td className="num">{fmtInt(c.t6Listings)}</td>
            </tr>
          )}
          <tr>
            <td>URUs — lifetime / T12</td>
            <td className="num">
              {fmtInt(c.urusLifetime)} / {fmtInt(c.urusT12)}
            </td>
          </tr>
          <tr>
            <td>Active inventory</td>
            <td className="num">{fmtInt(c.activeListings)}</td>
          </tr>
          <tr>
            <td>Data tier</td>
            <td className="num">
              <span className="dq-pill dq-pill-navy-soft">{c.dataTier}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PortfolioComposition({ scorecard }: { scorecard: ScorecardData }) {
  const c = scorecard.coverage;
  return (
    <div>
      <p className="dq-eyebrow-muted mb-2">Portfolio composition</p>
      <table className="dq-table">
        <thead>
          <tr>
            <th>Signal</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Observed managed units · this MSA</td>
            <td className="num">
              <strong>{fmtInt(c.totalObservedUnits)}</strong>
            </td>
          </tr>
          {c.nationalObservedUnitsT12 !== null && (
            <tr>
              <td>
                Observed units · all Dwellsy IQ markets{" "}
                <span className="text-muted-foreground">(T12)</span>
              </td>
              <td className="num">{fmtInt(c.nationalObservedUnitsT12)}</td>
            </tr>
          )}
          <tr>
            <td>Cities observed</td>
            <td className="num">{fmtInt(c.citiesObserved)}</td>
          </tr>
          {c.concentratedShare !== null && (
            <tr>
              <td>
                Share in concentrated communities{" "}
                <span className="text-muted-foreground">
                  (≥10 units / community)
                </span>
              </td>
              <td className="num">{fmtPct(c.concentratedShare * 100, 0)}</td>
            </tr>
          )}
          {c.observedCommunityTotalUnits !== undefined && (
            <tr>
              <td>
                Observed community totals{" "}
                <span className="text-muted-foreground">
                  (top-down PM-managed unit counts)
                </span>
              </td>
              <td className="num">{fmtInt(c.observedCommunityTotalUnits)}</td>
            </tr>
          )}
          <tr>
            <td>7-cell classification</td>
            <td className="num">
              <span className="dq-pill dq-pill-navy-soft">
                {scorecard.pm.quadrant7Cell ?? scorecard.pm.quadrant}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
