import type { ScorecardData, StarLevel } from "@/lib/types";
import { marketingDataSuppressed } from "@/lib/types";
import { fmtNumber, fmtPct } from "@/lib/format";
import { StarIcon } from "@/components/scorecard/StarIcon";

// v0.21 — Scorecard "lede": a fast, facts-oriented read that sits at the top
// of the Synthesis layer, above the prose + tile grid.
//
// Voice rule (deliberate, see PR spec): present the operator's COMPARABLE
// POSITION and OBSERVABLE ANOMALIES as facts, then frame the QUESTION a
// reader should ask — never a verdict. No "top-quartile", "strong", "rare",
// "best". The reader does the judging; we surface what's notable. Think
// institutional research / Bloomberg terminal, not a marketing blurb.
//
// Three pieces:
//   - HeadlineFactLine : positional facts (rank in cohort + composite)
//   - GradeStrip       : the 5 graded dimensions at a glance, each vs cohort
//   - QuestionsRaised  : rule-based (deterministic, no LLM) anomaly questions
//
// All three derive from the same seed fields the detail tiles use, so the
// numbers match exactly.

// --- Headline fact line ---

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

// --- Grade strip ---

type Dimension = {
  key: string;
  label: string;
  value: string; // operator's value, or "—"
  unit: string;
  cohort: string | null; // "vs 28d cohort" style; null when no comparator
  // Direction of the operator's value relative to the cohort median, as a
  // pure fact (above / below / at). NOT colored good/bad — the reader judges.
  direction: "above" | "below" | "at" | null;
  star: StarLevel;
};

function dir(value: number, cohort: number): "above" | "below" | "at" {
  const d = value - cohort;
  if (Math.abs(d) < 1e-9) return "at";
  return d > 0 ? "above" : "below";
}

function buildDimensions(
  scorecard: ScorecardData,
  showInventoryTransparency: boolean
): Dimension[] {
  const dims: Dimension[] = [];

  // Lease-up speed (DOM T12) — cohort = peer-quadrant median, else market.
  const perf = scorecard.performance;
  const domCohort = perf.peerQuadrantDomT12 ?? perf.marketDomT12;
  dims.push({
    key: "dom",
    label: "Lease-up",
    value: fmtNumber(perf.domT12, 0),
    unit: "d",
    cohort: Number.isFinite(domCohort)
      ? `vs ${fmtNumber(domCohort, 0)}d`
      : null,
    direction: Number.isFinite(domCohort) ? dir(perf.domT12, domCohort) : null,
    star: perf.domStar ?? null,
  });

  // Tenant retention.
  const ten = scorecard.tenancy;
  const tenCohort = ten.apartment.cohortP50 ?? ten.house.cohortP50 ?? null;
  dims.push({
    key: "tenancy",
    label: "Tenant retention",
    value: ten.overallGap !== null ? fmtNumber(ten.overallGap, 1) : "—",
    unit: "mo",
    cohort:
      ten.overallGap !== null && tenCohort !== null
        ? `vs ${fmtNumber(tenCohort, 1)}mo`
        : null,
    direction:
      ten.overallGap !== null && tenCohort !== null
        ? dir(ten.overallGap, tenCohort)
        : null,
    star: ten.star ?? null,
  });

  // Rent performance (operator YoY vs cohort median YoY).
  const rp = scorecard.rentPerformance;
  dims.push({
    key: "rentPerformance",
    label: "Rent performance",
    value: rp ? fmtPct(rp.pmYoyChange * 100, 1, true) : "—",
    unit: "YoY",
    cohort:
      rp && rp.cohortMedianYoyChange !== null
        ? `vs ${fmtPct((rp.cohortMedianYoyChange ?? 0) * 100, 1, true)}`
        : null,
    direction:
      rp && rp.cohortMedianYoyChange !== null
        ? dir(rp.pmYoyChange, rp.cohortMedianYoyChange)
        : null,
    star: rp?.star ?? null,
  });

  // Marketing discipline (composite /100 + percentile).
  const mkt = scorecard.marketing;
  const mktSuppressed = marketingDataSuppressed(mkt);
  const mktPct = scorecard.rank.percentiles.marketing;
  dims.push({
    key: "marketing",
    label: "Marketing",
    value: mktSuppressed ? "—" : fmtNumber(mkt.compositeScore, 0),
    unit: mktSuppressed ? "" : "/100",
    cohort: !mktSuppressed && mktPct !== null ? `${mktPct}th pct` : null,
    direction: null, // percentile already encodes position; no glyph
    star: mktSuppressed ? null : mkt.star ?? null,
  });

  // Inventory transparency (MF/BTR with CV scope only).
  if (showInventoryTransparency && scorecard.communityVisibility) {
    const cv = scorecard.communityVisibility;
    dims.push({
      key: "communityVisibility",
      label: "Inventory transp.",
      value: fmtNumber(cv.ratio, 2),
      unit: "ratio",
      cohort: null,
      direction: null,
      star: cv.star ?? null,
    });
  }

  return dims;
}

function DirGlyph({ direction }: { direction: Dimension["direction"] }) {
  if (!direction) return null;
  // Neutral grey — a factual above/below/at marker, intentionally NOT
  // colored to imply good/bad (e.g. faster lease-up reads as "below cohort"
  // but that's not a value judgment).
  const glyph = direction === "above" ? "▲" : direction === "below" ? "▼" : "—";
  return (
    <span aria-hidden className="text-[10px] text-muted-2">
      {glyph}
    </span>
  );
}

export function GradeStrip({
  scorecard,
  showInventoryTransparency,
}: {
  scorecard: ScorecardData;
  showInventoryTransparency: boolean;
}) {
  const dims = buildDimensions(scorecard, showInventoryTransparency);
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-grid bg-grid sm:grid-cols-4 lg:grid-cols-5"
      data-testid="grade-strip"
    >
      {dims.map((d) => (
        <a
          key={d.key}
          href="#performance"
          className="flex flex-col gap-1 bg-white p-3 transition-colors hover:bg-surface-soft"
        >
          <span className="text-[10.5px] font-semibold uppercase leading-[1.2] tracking-[0.08em] text-muted-foreground">
            {d.label}
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="dq-tnum text-[19px] font-bold leading-none text-navy">
              {d.value}
            </span>
            {d.unit && (
              <span className="text-[11px] font-medium text-muted-foreground">
                {d.unit}
              </span>
            )}
            <StarIcon level={d.star} size={13} />
          </span>
          {d.cohort && (
            <span className="flex items-center gap-1 text-[11.5px] leading-[1.3] text-muted-foreground">
              <DirGlyph direction={d.direction} />
              {d.cohort}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

// --- Questions this raises (rule-based, deterministic) ---

type RaisedQuestion = { fact: string; question: string };

// Thresholds for "materially different from cohort". Fixed (not per-cohort
// SD, which the per-operator scorecard doesn't carry) but chosen to fire
// only on genuinely notable gaps so the section stays sparse + diagnostic.
const RENT_GAP_PP = 5; // percentage points of YoY rent growth vs cohort
const DOM_GAP_DAYS = 7; // days of lease-up vs cohort
const CONCESSION_RATE = 0.35; // share of T12 listings mentioning concessions
const SHORT_HISTORY_YEARS = 3; // methodology reference window

export function buildScorecardQuestions(
  scorecard: ScorecardData
): RaisedQuestion[] {
  const out: RaisedQuestion[] = [];

  // Rent growth materially off cohort.
  const rp = scorecard.rentPerformance;
  if (rp && rp.cohortMedianYoyChange !== null) {
    const gapPp = (rp.pmYoyChange - rp.cohortMedianYoyChange) * 100;
    if (Math.abs(gapPp) >= RENT_GAP_PP) {
      out.push({
        fact: `Rent growth ${fmtPct(rp.pmYoyChange * 100, 1, true)} YoY vs cohort ${fmtPct((rp.cohortMedianYoyChange ?? 0) * 100, 1, true)}.`,
        question:
          gapPp > 0
            ? "What's behind the above-cohort growth — pricing power, unit mix, or an undersupplied submarket?"
            : "What's behind the below-cohort growth — repositioning, concessions, or a softer submarket?",
      });
    }
  }

  // Lease-up materially off cohort.
  const perf = scorecard.performance;
  const domCohort = perf.peerQuadrantDomT12 ?? perf.marketDomT12;
  if (Number.isFinite(domCohort) && Math.abs(perf.domT12 - domCohort) >= DOM_GAP_DAYS) {
    out.push({
      fact: `Lease-up ${fmtNumber(perf.domT12, 0)} days vs cohort ${fmtNumber(domCohort, 0)}.`,
      question:
        perf.domT12 < domCohort
          ? "What's driving the faster lease-up — pricing, demand pocket, or inventory type?"
          : "What's behind the slower lease-up — pricing, asset condition, or submarket demand?",
    });
  }

  // High concession prevalence.
  const cr = scorecard.concessionRate;
  if (typeof cr === "number" && cr >= CONCESSION_RATE) {
    out.push({
      fact: `Concessions on ${Math.round(cr * 100)}% of trailing-12-month listings.`,
      question: "What's the competitive pressure prompting the incentives?",
    });
  }

  // Short observation history (inherent uncertainty, not a cohort gap).
  const years = scorecard.coverage.yearsVisible ?? scorecard.tenancy.yearsVisible;
  if (typeof years === "number" && years < SHORT_HISTORY_YEARS) {
    out.push({
      fact: `Observation history ${fmtNumber(years, 1)} years, shorter than the ${SHORT_HISTORY_YEARS}-year reference window.`,
      question: "What does the operator's longer track record look like off-platform?",
    });
  }

  // Most diagnostic first; cohort-gap questions already precede the
  // uncertainty ones by insertion order. Cap at 3 to keep it scannable.
  return out.slice(0, 3);
}

export function QuestionsRaised({ scorecard }: { scorecard: ScorecardData }) {
  const questions = buildScorecardQuestions(scorecard);
  if (questions.length === 0) return null;
  return (
    <div data-testid="questions-raised">
      <p className="dq-eyebrow">Questions this raises</p>
      <ul className="mt-3 max-w-[820px] space-y-2.5">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-[1.55]">
            <span
              aria-hidden
              className="mt-[2px] shrink-0 font-semibold text-teal"
            >
              ?
            </span>
            <span>
              <span className="text-foreground">{q.fact}</span>{" "}
              <span className="text-muted-foreground">{q.question}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
