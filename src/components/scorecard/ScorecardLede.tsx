import type { ScorecardData } from "@/lib/types";
import { fmtNumber } from "@/lib/format";

// v0.21 — Scorecard headline fact line. The one-line, facts-only lede at the
// top of the Synthesis layer: the operator's position in its in-market 7-cell
// cohort + composite. No adjectives, no verdict — the reader judges.
//
// Scoped intentionally to JUST the rank/composite fact: the headline-metric
// tiles below already carry the per-dimension numbers, and the (neutral)
// executive summary carries the narrative. This line owns the one thing
// neither shows — where the operator ranks.
//
// Voice rule for all scorecard copy: present comparable position + observable
// facts; never "top-quartile" / "strong" / "rare". Institutional-research
// register.

function ordinalCohortLabel(scorecard: ScorecardData): string {
  // 7-cell cohort, in-market — the apples-to-apples denominator the
  // methodology already ranks within (rank.quadrant / quadrantTotal).
  const cell = scorecard.pm.quadrant7Cell ?? "operators";
  const rank = scorecard.rank.quadrant;
  const total = scorecard.rank.quadrantTotal;
  const market = scorecard.market.name;
  if (rank && total) {
    return `${rank} of ${total} ${cell} operators in ${market}`;
  }
  // Fallback to overall-market rank when the 7-cell rank is absent.
  return `${scorecard.rank.overall} of ${scorecard.rank.overallTotal} ranked operators in ${market}`;
}

export function HeadlineFactLine({ scorecard }: { scorecard: ScorecardData }) {
  const composite = scorecard.rank.composite;
  return (
    <p
      className="-mt-4 max-w-[820px] text-[16px] leading-[1.5] text-navy"
      data-testid="headline-fact-line"
    >
      <span className="font-semibold">{ordinalCohortLabel(scorecard)}</span>
      {composite !== null && (
        <span className="text-muted-foreground">
          {" · composite "}
          {fmtNumber(composite, 1)} / 100
        </span>
      )}
    </p>
  );
}
