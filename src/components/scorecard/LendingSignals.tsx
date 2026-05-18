import type {
  GeographicConcentrationSignal,
  LendingSignals as LendingSignalsData,
  OperatorStabilitySignal,
  PricingTierSignal,
  RentStabilitySignal,
  SignalDistribution,
  VacancySignal,
} from "@/lib/lending-signals";
import type { StarLevel } from "@/lib/types";
import { fmtNumber, fmtPct } from "@/lib/format";

// Layer 4 — Lending Signals card (Scorecard_Design_Spec_v1.0.md Section 3,
// Layer 4). 5 signal subcards in a compact 3-2 grid, sized for a 2-minute
// scan by lender / acquisition teams. Each subcard renders a value, cohort
// context, and a star (signals 1, 2, 3) or descriptive indicator (signal 4)
// or tier label (signal 5).
//
// Per Decision G.4, Signal 4 (Geographic Concentration) uses a linear
// position indicator with no implicit value judgment — concentration is
// descriptive, not labeled good/bad. Same for Signal 5 (Pricing Tier) —
// Premium/Mid-market/Value are positional labels not evaluative ones.

export function LendingSignals({
  signals,
}: {
  signals: LendingSignalsData;
}) {
  const hasAny =
    signals.vacancy ||
    signals.rentStability ||
    signals.operatorStability ||
    signals.geographicConcentration ||
    signals.pricingTier;
  if (!hasAny) return null;

  return (
    <section
      id="lending-signals"
      aria-label="Lending Signals"
      className="dq-section space-y-6"
    >
      <div>
        <p className="dq-eyebrow">Lending Signals</p>
        <p className="mt-3 max-w-[780px] text-[14px] leading-[1.6] text-muted-foreground">
          Underwriting-relevant synthesis metrics designed for a 30-second
          scan. Cohort comparison shown for each signal; quartile position
          drives star where applicable.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {signals.vacancy && <VacancySignalCard signal={signals.vacancy} />}
        {signals.rentStability && (
          <RentStabilitySignalCard signal={signals.rentStability} />
        )}
        {signals.operatorStability && (
          <OperatorStabilitySignalCard signal={signals.operatorStability} />
        )}
        {signals.geographicConcentration && (
          <GeographicConcentrationSignalCard
            signal={signals.geographicConcentration}
          />
        )}
        {signals.pricingTier && (
          <PricingTierSignalCard signal={signals.pricingTier} />
        )}
      </div>
    </section>
  );
}

// --- Subcard primitives ---

function SignalCard({
  title,
  star,
  children,
  contextLine,
}: {
  title: string;
  star?: StarLevel | null;
  children: React.ReactNode;
  contextLine?: React.ReactNode;
}) {
  return (
    <article className="relative flex flex-col gap-3 rounded-[12px] border border-grid bg-white p-4 pt-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[12px] font-semibold uppercase leading-[1.2] tracking-[0.1em] text-muted-foreground">
          {title}
        </h3>
        <InfoIcon />
      </div>
      <div className="flex items-start gap-2">
        {star !== undefined && <StarIcon level={star ?? null} size={16} />}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {contextLine && (
        <p className="text-[12px] leading-[1.45] text-muted-foreground">
          {contextLine}
        </p>
      )}
    </article>
  );
}

// --- Signal 1 — Vacancy Signal ---
function VacancySignalCard({ signal }: { signal: VacancySignal }) {
  if (signal.vacancyPct === null) {
    return (
      <SignalCard title="Vacancy Signal" star={null}>
        <p className="text-[13.5px] italic text-muted-2">
          Insufficient DOM or tenancy data to compute.
        </p>
      </SignalCard>
    );
  }
  return (
    <SignalCard
      title="Vacancy Signal"
      star={signal.star}
      contextLine={
        signal.dist.cohortMedian !== null ? (
          <>
            {signal.dist.cohortName} · cohort median{" "}
            <span className="dq-tnum font-semibold text-navy">
              {fmtNumber(signal.dist.cohortMedian, 1)}%
            </span>
          </>
        ) : (
          signal.dist.cohortName
        )
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span className="dq-tnum text-[26px] font-bold leading-none tracking-[-0.02em] text-navy">
          {fmtNumber(signal.vacancyPct, 1)}
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">
          % of cycle
        </span>
      </div>
    </SignalCard>
  );
}

// --- Signal 2 — Rent Stability ---
function RentStabilitySignalCard({ signal }: { signal: RentStabilitySignal }) {
  if (signal.suppressed || signal.volatilityPP === null) {
    return (
      <SignalCard
        title="Rent Stability"
        star={null}
        contextLine={
          signal.yearsOfHistory
            ? `Operator visible ${fmtNumber(signal.yearsOfHistory, 1)} years in our data.`
            : undefined
        }
      >
        <p className="text-[13.5px] italic text-muted-2">
          {signal.reason || "Insufficient observation history to compute."}
        </p>
      </SignalCard>
    );
  }
  return (
    <SignalCard
      title="Rent Stability"
      star={signal.star}
      contextLine={
        signal.cohortMedianVolatility !== null ? (
          <>
            Cohort median{" "}
            <span className="dq-tnum font-semibold text-navy">
              {fmtNumber(signal.cohortMedianVolatility, 1)}pp
            </span>{" "}
            · {fmtNumber(signal.yearsOfHistory, 1)}y observation
          </>
        ) : (
          `${fmtNumber(signal.yearsOfHistory, 1)}y observation`
        )
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span className="dq-tnum text-[26px] font-bold leading-none tracking-[-0.02em] text-navy">
          {fmtNumber(signal.volatilityPP, 1)}
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">
          pp YoY stdev
        </span>
      </div>
    </SignalCard>
  );
}

// --- Signal 3 — Operator Stability ---
function OperatorStabilitySignalCard({
  signal,
}: {
  signal: OperatorStabilitySignal;
}) {
  if (signal.yearsVisible === null) {
    return (
      <SignalCard title="Operator Stability" star={null}>
        <p className="text-[13.5px] italic text-muted-2">
          Insufficient observation history to compute.
        </p>
      </SignalCard>
    );
  }
  return (
    <SignalCard
      title="Operator Stability"
      star={signal.star}
      contextLine={
        signal.dist.cohortMedian !== null ? (
          <>
            {signal.dist.cohortName} · cohort median{" "}
            <span className="dq-tnum font-semibold text-navy">
              {fmtNumber(signal.dist.cohortMedian, 1)}y visible
            </span>
          </>
        ) : (
          signal.dist.cohortName
        )
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span className="dq-tnum text-[26px] font-bold leading-none tracking-[-0.02em] text-navy">
          {fmtNumber(signal.yearsVisible, 1)}
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">
          years visible · {signal.marketCount}{" "}
          {signal.marketCount === 1 ? "market" : "markets"}
        </span>
      </div>
    </SignalCard>
  );
}

// --- Signal 4 — Geographic Concentration (linear position, no star) ---
function GeographicConcentrationSignalCard({
  signal,
}: {
  signal: GeographicConcentrationSignal;
}) {
  // Render a horizontal track with two markers: cohort median (teal tick) and
  // operator position (navy dot). Spans the typical 0-100% range.
  const focalPos = clamp(signal.top3CityShare * 100, 0, 100);
  const cohortPos = clamp(signal.cohortMedianTop3 * 100, 0, 100);
  const positionLabel =
    signal.positionIndicator === "more_concentrated"
      ? "More concentrated than cohort"
      : signal.positionIndicator === "more_dispersed"
        ? "More dispersed than cohort"
        : "Near cohort median";

  return (
    <SignalCard
      title="Geographic Concentration"
      // Explicitly omit star — descriptive only per Decision G.4.
      contextLine={
        <>
          Cohort median{" "}
          <span className="dq-tnum font-semibold text-navy">
            {fmtPct(signal.cohortMedianTop3 * 100, 0)}
          </span>{" "}
          · {positionLabel}
        </>
      }
    >
      <div className="flex items-baseline gap-1.5">
        <span className="dq-tnum text-[26px] font-bold leading-none tracking-[-0.02em] text-navy">
          {fmtNumber(signal.top3CityShare * 100, 0)}
        </span>
        <span className="text-[12.5px] font-medium text-muted-foreground">
          % in top 3 cities
        </span>
      </div>
      {/* Linear position bar */}
      <div className="mt-3 relative h-[8px] rounded-full bg-grid-soft">
        <div
          className="absolute top-0 h-[8px] w-[2px] -translate-x-1/2 bg-teal"
          style={{ left: `${cohortPos}%` }}
          aria-label="Cohort median"
        />
        <div
          className="absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-navy bg-white shadow-sm"
          style={{ left: `${focalPos}%` }}
          aria-label="Operator position"
        />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-muted-2">
        <span>Dispersed</span>
        <span>Concentrated</span>
      </div>
    </SignalCard>
  );
}

// --- Signal 5 — Pricing Tier ---
function PricingTierSignalCard({ signal }: { signal: PricingTierSignal }) {
  if (signal.tier === null || signal.operatorRent === null) {
    return (
      <SignalCard title="Pricing Tier">
        <p className="text-[13.5px] italic text-muted-2">
          Insufficient rent trajectory data to position.
        </p>
      </SignalCard>
    );
  }
  const tierLabel =
    signal.tier === "premium"
      ? "Premium"
      : signal.tier === "value"
        ? "Value"
        : "Mid-market";
  const tierTone =
    signal.tier === "premium"
      ? "text-navy"
      : signal.tier === "value"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <SignalCard
      title="Pricing Tier"
      // No star — tier label is descriptive, not evaluative per Decision G.4.
      contextLine={
        signal.msaP25 !== null && signal.msaP75 !== null ? (
          <>
            MSA 25th–75th{" "}
            <span className="dq-tnum font-semibold text-navy">
              ${fmtNumber(signal.msaP25, 0)} – ${fmtNumber(signal.msaP75, 0)}
            </span>{" "}
            · {signal.percentile !== null && `${Math.round(signal.percentile)}th percentile`}
          </>
        ) : (
          "MSA distribution unavailable"
        )
      }
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-[22px] font-bold leading-none ${tierTone}`}>
          {tierLabel}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Operator median{" "}
        <span className="dq-tnum font-semibold text-navy">
          ${fmtNumber(signal.operatorRent, 0)}
        </span>
      </p>
    </SignalCard>
  );
}

// --- Inline primitives ---

function InfoIcon() {
  return (
    <span
      aria-hidden
      title="Methodology details (coming in v1.0 Phase G)"
      className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-grid bg-white text-[9px] font-semibold text-muted-2"
    >
      i
    </span>
  );
}

function StarIcon({ level, size = 14 }: { level: StarLevel; size?: number }) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  const fill = isGold ? "#E5A800" : isSilver ? "#9CA3AF" : "transparent";
  const stroke = isGold ? "#B98700" : isSilver ? "#6B7280" : "var(--color-muted-2)";
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
          ? "Gold star"
          : level === "silver"
            ? "Silver star"
            : "No star"
      }
      className="mt-0.5 shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Suppress unused-import for SignalDistribution type re-export.
export type { SignalDistribution };
