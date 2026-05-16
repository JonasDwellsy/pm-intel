import { SectionHead } from "./SectionHead";
import { CoverageMapClient } from "./CoverageMapClient";
import type { ScorecardData } from "@/lib/types";
import { fmtInt } from "@/lib/format";

const DEFAULT_ACCENT = "#D97834";

export function CoverageMap({ scorecard }: { scorecard: ScorecardData }) {
  const { coverage, geographicCoverage, market } = scorecard;
  const accentColor = scorecard.pm.accentColor ?? DEFAULT_ACCENT;

  return (
    <section id="geography" className="dq-section">
      <SectionHead
        num="03"
        title="Geographic coverage"
        lede={`Where ${scorecard.pm.name}'s portfolio sits within the ${market.fullName} footprint.`}
      />

      <CoverageMapClient
        coveragePoints={geographicCoverage.coverageMapPoints ?? []}
        backdropPoints={geographicCoverage.msaBackdropPoints ?? []}
        mapBounds={geographicCoverage.mapBounds}
        accentColor={accentColor}
        fallbackCity={market.name}
        fallbackMsa={market.fullName}
      />

      <div className="mt-4 grid gap-6 px-2 py-4 md:grid-cols-[1fr_2fr_1.2fr]">
        <div>
          <p className="dq-eyebrow-muted mb-1.5">Cities observed</p>
          <p className="text-sm text-navy">
            <strong>{fmtInt(coverage.citiesObserved)}</strong> in the MSA
            footprint
          </p>
        </div>
        <div>
          <p className="dq-eyebrow-muted mb-1.5">Coverage concentration</p>
          <p className="text-sm text-navy">{geographicCoverage.citiesText}</p>
        </div>
        <div>
          <p className="dq-eyebrow-muted mb-1.5">Geographic posture</p>
          <p className="text-sm">
            <span className="dq-pill dq-pill-navy-soft">
              {coverage.citiesObserved === 1
                ? "Single-submarket"
                : coverage.citiesObserved <= 5
                  ? "Concentrated"
                  : "Multi-city"}
            </span>{" "}
            <span className="text-muted-foreground">
              {scorecard.pm.quadrant.split(" / ")[0]} footprint
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
