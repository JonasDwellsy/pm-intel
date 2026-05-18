import type { ScorecardData, StarLevel } from "@/lib/types";
import { fmtNumber, fmtPct } from "@/lib/format";
import { InfoIcon } from "@/components/scorecard/InfoIcon";
import type { MetricKey } from "@/lib/metric-definitions";

// Layer 2 — Synthesis block (v1.0 design, per Scorecard_Design_Spec_v1.0.md
// Section 3, Layer 2). Three sub-components in sequence:
//
//   2A — Executive summary: 3-sentence prose paragraph from
//        scorecard.generatedText.executiveSummary, pre-computed at seed time
//        per v0.6.2 Patch 8 and dignity-validated.
//
//   2B — Headline metric tiles: one tile per performance dimension. SFR and
//        Hybrid render 4 tiles; MF/BTR operators with Community Visibility
//        scope-gate qualifying render 5 (adding Inventory Transparency). Each
//        tile shows metric name, headline value with star, cohort comparison
//        line, and a placeholder "i" icon (Phase G modal infrastructure).
//
//   2C — Distinguishing characteristics: 2-4 priority-ranked observation
//        bullets from generatedText.distinguishingCharacteristics. Suppressed
//        when fewer than 2 candidate observations are present.
//
// Both pre-computed text blocks already pass the operator-dignity language
// gate per the v0.6.2 seed pipeline; no client-side filtering required.

type OperatorType = "sfr" | "mfbtr" | "hybrid";

function classifyOperator(scorecard: ScorecardData): OperatorType {
  const q = (scorecard.pm.quadrant7Cell ?? "").toLowerCase();
  if (q.startsWith("sfr")) return "sfr";
  if (q.startsWith("small mf") || q.startsWith("large mf")) return "mfbtr";
  if (q.startsWith("hybrid")) return "hybrid";
  // Fall back via the legacy 5-cell label.
  const legacy = (scorecard.pm.quadrant ?? "").toLowerCase();
  if (legacy.includes("scattered")) return "sfr";
  if (legacy.includes("mf") || legacy.includes("btr")) return "mfbtr";
  return "hybrid";
}

export function SynthesisLayer({ scorecard }: { scorecard: ScorecardData }) {
  const opType = classifyOperator(scorecard);
  // 5th tile renders only for MF/BTR operators whose Community Visibility
  // scope gate passed (the seed sets the block to null otherwise).
  const showInventoryTransparency =
    opType === "mfbtr" && scorecard.communityVisibility !== null;
  const tileCount = showInventoryTransparency ? 5 : 4;

  const executiveSummary = scorecard.generatedText?.executiveSummary?.trim();
  const bullets =
    scorecard.generatedText?.distinguishingCharacteristics?.filter(
      (b) => typeof b === "string" && b.trim().length > 0
    ) ?? [];

  return (
    <section id="synthesis" aria-label="Synthesis" className="dq-section space-y-10">
      {/* 2A — Executive summary */}
      {executiveSummary && (
        <div>
          <p className="dq-eyebrow inline-flex items-center gap-1.5">
            Executive summary
            <InfoIcon metricKey="section-executive-summary" />
          </p>
          <p className="mt-3 max-w-[780px] text-[16.5px] leading-[1.65] text-foreground text-pretty">
            {executiveSummary}
          </p>
        </div>
      )}

      {/* 2B — Headline metric tiles */}
      <div>
        <p className="dq-eyebrow">Headline metrics</p>
        <div
          className={
            "mt-4 grid gap-3 " +
            (tileCount === 5
              ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
              : "grid-cols-2 lg:grid-cols-4")
          }
        >
          <LeaseUpTile scorecard={scorecard} />
          <TenantRetentionTile scorecard={scorecard} />
          <RentPerformanceTile scorecard={scorecard} />
          <OperationalDisciplineTile scorecard={scorecard} />
          {showInventoryTransparency && (
            <InventoryTransparencyTile scorecard={scorecard} />
          )}
        </div>
      </div>

      {/* 2C — Distinguishing characteristics */}
      {bullets.length >= 2 && (
        <div>
          <p className="dq-eyebrow inline-flex items-center gap-1.5">
            Distinguishing characteristics
            <InfoIcon metricKey="section-distinguishing-characteristics" />
          </p>
          <ul className="mt-3 max-w-[780px] space-y-2 text-[15px] leading-[1.6] text-foreground">
            {bullets.slice(0, 4).map((b, i) => (
              <li key={i} className="flex gap-2.5">
                <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// --- Tile components ---

function LeaseUpTile({ scorecard }: { scorecard: ScorecardData }) {
  const { performance } = scorecard;
  const star = performance.domStar ?? null;
  const peerMedian = performance.peerQuadrantDomT12 ?? performance.marketDomT12;
  const delta = performance.domT12 - peerMedian;
  // Faster = better, so a negative delta is favorable.
  const direction =
    delta < -0.05 ? "favorable" : delta > 0.05 ? "unfavorable" : "neutral";
  return (
    <MetricTile
      title="Lease-up Speed"
      metricKey="dom"
      headlineValue={fmtNumber(performance.domT12, 1)}
      headlineUnit="days"
      star={star}
      comparison={
        Number.isFinite(peerMedian)
          ? formatDeltaDays(delta, peerMedian, direction)
          : `n = ${performance.domT12N} listings (T12)`
      }
    />
  );
}

function TenantRetentionTile({ scorecard }: { scorecard: ScorecardData }) {
  const { tenancy } = scorecard;
  const value = tenancy.overallGap;
  const star = tenancy.star ?? null;
  const cohortMedian =
    tenancy.apartment.cohortP50 ?? tenancy.house.cohortP50 ?? null;
  const caveat = tenancy.shortHistoryFlag === true;
  return (
    <MetricTile
      title="Tenant Retention"
      metricKey="tenancy"
      headlineValue={value !== null ? fmtNumber(value, 1) : "—"}
      headlineUnit="mo median"
      star={star}
      comparison={
        value !== null && cohortMedian !== null
          ? formatDeltaMonths(value - cohortMedian, cohortMedian, "favorable_high")
          : value !== null
            ? `${tenancy.totalUnits} units observed`
            : "Insufficient data"
      }
      caveat={
        caveat && tenancy.yearsVisible !== undefined
          ? `Short observation history · ${fmtNumber(tenancy.yearsVisible, 1)} years visible`
          : undefined
      }
    />
  );
}

function RentPerformanceTile({ scorecard }: { scorecard: ScorecardData }) {
  const rp = scorecard.rentPerformance;
  if (!rp) {
    return (
      <MetricTile
        title="Rent Performance"
        metricKey="rentPerformance"
        headlineValue="—"
        headlineUnit=""
        star={null}
        comparison="Insufficient data"
      />
    );
  }
  const deltaPp = (rp.delta ?? 0) * 100;
  const sign = deltaPp > 0 ? "+" : "";
  return (
    <MetricTile
      title="Rent Performance"
      metricKey="rentPerformance"
      headlineValue={`${sign}${fmtNumber(deltaPp, 1)}`}
      headlineUnit="pp vs cohort"
      star={rp.star ?? null}
      comparison={
        rp.pmYoyChange !== null && rp.cohortMedianYoyChange !== null
          ? `Operator ${fmtPct(rp.pmYoyChange * 100, 1, true)} · Cohort ${fmtPct((rp.cohortMedianYoyChange ?? 0) * 100, 1, true)}`
          : `Operator YoY ${fmtPct(rp.pmYoyChange * 100, 1, true)}`
      }
    />
  );
}

function OperationalDisciplineTile({ scorecard }: { scorecard: ScorecardData }) {
  const { marketing } = scorecard;
  const score = marketing.compositeScore;
  const pct = scorecard.rank.percentiles.marketing;
  return (
    <MetricTile
      title="Operational Discipline"
      metricKey="marketing"
      headlineValue={fmtNumber(score, 0)}
      headlineUnit="/ 100"
      star={marketing.star ?? null}
      comparison={
        pct !== null
          ? `${formatPercentileLabel(pct)} in cohort`
          : "Marketing quality composite"
      }
    />
  );
}

function InventoryTransparencyTile({
  scorecard,
}: {
  scorecard: ScorecardData;
}) {
  const cv = scorecard.communityVisibility;
  if (!cv) return null;
  return (
    <MetricTile
      title="Inventory Transparency"
      metricKey="communityVisibility"
      headlineValue={fmtNumber(cv.ratio, 2)}
      headlineUnit="ratio"
      star={cv.star ?? null}
      comparison={cv.stateLabel}
    />
  );
}

// --- Reusable tile primitive ---

function MetricTile({
  title,
  metricKey,
  headlineValue,
  headlineUnit,
  star,
  comparison,
  caveat,
}: {
  title: string;
  metricKey: MetricKey;
  headlineValue: string;
  headlineUnit: string;
  star: StarLevel;
  comparison: string;
  caveat?: string;
}) {
  return (
    <article className="relative flex flex-col gap-2 rounded-[12px] border border-grid bg-white p-4 pt-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase leading-[1.2] tracking-[0.1em] text-muted-foreground">
          {title}
        </h3>
        <InfoIcon metricKey={metricKey} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="dq-tnum text-[28px] font-bold leading-none tracking-[-0.02em] text-navy">
          {headlineValue}
        </span>
        {headlineUnit && (
          <span className="text-[12.5px] font-medium text-muted-foreground">
            {headlineUnit}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StarIcon level={star} size={16} />
        <p className="text-[12.5px] font-medium leading-[1.4] text-muted-foreground">
          {comparison}
        </p>
      </div>
      {caveat && (
        <p className="mt-0.5 text-[11.5px] italic leading-[1.4] text-muted-2">
          {caveat}
        </p>
      )}
    </article>
  );
}

// --- Inline primitives ---

function StarIcon({
  level,
  size = 16,
}: {
  level: StarLevel;
  size?: number;
}) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  const fill = isGold
    ? "#E5A800"
    : isSilver
      ? "#9CA3AF"
      : "transparent";
  const stroke = isGold
    ? "#B98700"
    : isSilver
      ? "#6B7280"
      : "var(--color-muted-2)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-label={
        level === "gold"
          ? "Gold star — top quartile in cohort"
          : level === "silver"
            ? "Silver star — above median in cohort"
            : "No star — present in cohort"
      }
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}

// --- Helpers ---

function formatDeltaDays(
  delta: number,
  cohortMedian: number,
  direction: "favorable" | "unfavorable" | "neutral"
): string {
  if (Math.abs(delta) < 0.05) {
    return `vs cohort median ${fmtNumber(cohortMedian, 1)}d`;
  }
  const arrow = direction === "favorable" ? "▼" : "▲";
  return `${arrow} ${fmtNumber(Math.abs(delta), 1)}d vs cohort ${fmtNumber(cohortMedian, 1)}d`;
}

function formatDeltaMonths(
  delta: number,
  cohortMedian: number,
  semantic: "favorable_high"
): string {
  if (Math.abs(delta) < 0.05) {
    return `vs cohort median ${fmtNumber(cohortMedian, 1)}mo`;
  }
  const arrow =
    semantic === "favorable_high" && delta > 0
      ? "▲"
      : semantic === "favorable_high" && delta < 0
        ? "▼"
        : "▲";
  return `${arrow} ${fmtNumber(Math.abs(delta), 1)}mo vs cohort ${fmtNumber(cohortMedian, 1)}mo`;
}

function formatPercentileLabel(pct: number): string {
  return `${Math.round(pct)}th percentile`;
}
