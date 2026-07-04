// Scorecard redesign — Operating Performance section (02).
// Server component; no client hooks.
// Renders evidence cards per the `.mcard` pattern in scorecard-v5.html.

import type { OperatingView, MetricRow } from "@/lib/scorecard/view-model";
import { LabelChip } from "./LabelChip";
import { PositionBar } from "./PositionBar";

interface OperatingPerformanceSectionProps {
  operating: OperatingView;
}

/** Round a number for display; guards null. */
function fmt(n: number | null, digits = 1): string | null {
  return n != null ? n.toFixed(digits) : null;
}

/** Star glyph rendered when metric.star is "gold" or "silver". */
function StarGlyph({ star }: { star: MetricRow["star"] }) {
  if (!star) return null;
  const color = star === "gold" ? "#d4a017" : "#9aa4b2";
  return (
    <span style={{ color, fontSize: "13px", lineHeight: 1 }}>★</span>
  );
}

/** "Strongest / Watch" chip row — pill-style tags from the mockup .swchip. */
function SwChipRow({ strongest, watch }: { strongest: string[]; watch: string[] }) {
  if (strongest.length === 0 && watch.length === 0) return null;

  const chipStyle: React.CSSProperties = {
    fontSize: "11px",
    padding: "3px 9px",
    borderRadius: "20px",
    border: "1px solid #e0e5ee",
    display: "inline-block",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center",
        margin: "0 0 16px",
        fontSize: "11.5px",
        color: "#5b6577",
      }}
    >
      {strongest.length > 0 && (
        <>
          <span>Strongest:</span>
          {strongest.map((name) => (
            <span key={name} style={chipStyle}>
              <span style={{ fontWeight: 700, color: "#1a7f5a" }}>{name}</span>
            </span>
          ))}
        </>
      )}
      {strongest.length > 0 && watch.length > 0 && (
        <span style={{ margin: "0 2px" }}>&nbsp;·&nbsp;</span>
      )}
      {watch.length > 0 && (
        <>
          <span>Watch:</span>
          {watch.map((name) => (
            <span key={name} style={chipStyle}>
              <span style={{ fontWeight: 700, color: "#5b6577" }}>{name}</span>
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/** Single evidence card matching the mockup .mcard. */
function MetricCard({ metric }: { metric: MetricRow }) {
  const subText = metric.sub.join(" · ");

  return (
    <div
      style={{
        border: "1px solid #e2e7ef",
        borderRadius: "10px",
        padding: "13px 15px",
        marginBottom: "11px",
      }}
    >
      {/* Card header: title + star + spacer + label chip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "5px",
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#0f1f3f",
          }}
        >
          {metric.title}
        </span>
        <StarGlyph star={metric.star} />
        {/* spacer */}
        <span style={{ flex: 1 }} />
        <LabelChip label={metric.label} />
      </div>

      {/* Interpretive line — uses benchmark as the context sentence */}
      {metric.benchmark && (
        <div
          style={{
            fontSize: "12.5px",
            color: "#2a3547",
            marginBottom: "12px",
          }}
        >
          {metric.benchmark}
        </div>
      )}

      {/* Evidence row: big value + position bar + benchmark text */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "74px 1fr 150px",
          gap: "14px",
          alignItems: "center",
        }}
      >
        {/* Big value */}
        <div>
          <span
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "#0f1f3f",
              lineHeight: 1.1,
              display: "block",
            }}
          >
            {metric.value}
          </span>
        </div>

        {/* Position bar */}
        <div>
          <PositionBar position={metric.position} />
        </div>

        {/* Benchmark label */}
        <div
          style={{
            fontSize: "11.5px",
            color: "#5b6577",
          }}
        >
          {metric.benchmark}
        </div>
      </div>

      {/* Sub-metric strip */}
      {subText && (
        <div
          style={{
            marginTop: "11px",
            paddingTop: "9px",
            borderTop: "1px solid #f0f2f6",
            fontSize: "11.5px",
            color: "#5b6577",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          {metric.sub.map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      )}

      {/* Static "▸ Peer comparison" disclose affordance */}
      <div
        style={{
          color: "#8894ac",
          fontSize: "11px",
          marginTop: "10px",
          marginBottom: "2px",
        }}
      >
        ▸ Peer comparison
      </div>
    </div>
  );
}

/** Shared card shell (border/radius/padding) for the restored-metric cards below. */
const cardShellStyle: React.CSSProperties = {
  border: "1px solid #e2e7ef",
  borderRadius: "10px",
  padding: "13px 15px",
  marginBottom: "11px",
};

/** Card header row: title + star + spacer. No label chip (these metrics aren't cohort-scored labels). */
function CardHeader({ title, star }: { title: string; star: MetricRow["star"] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "5px",
      }}
    >
      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f1f3f" }}>{title}</span>
      <StarGlyph star={star} />
    </div>
  );
}

/** Evidence row: big value + position bar (n/a — no percentile for these metrics) + benchmark text. */
function EvidenceRow({ value, benchmark }: { value: string; benchmark: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "74px 1fr 150px",
        gap: "14px",
        alignItems: "center",
      }}
    >
      <div>
        <span
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "#0f1f3f",
            lineHeight: 1.1,
            display: "block",
          }}
        >
          {value}
        </span>
      </div>
      <div>
        <PositionBar position={null} />
      </div>
      <div style={{ fontSize: "11.5px", color: "#5b6577" }}>{benchmark}</div>
    </div>
  );
}

/** Vacancy signal card — value `${pct}% of cycle`, benchmark `cohort median ${cohortMedianPct}%`. */
function VacancyCard({ vacancy }: { vacancy: NonNullable<OperatingView["vacancy"]> }) {
  const pct = fmt(vacancy.pct);
  const benchmark = vacancy.cohortMedianPct != null ? `cohort median ${fmt(vacancy.cohortMedianPct)}%` : "";
  return (
    <div style={cardShellStyle}>
      <CardHeader title="Vacancy signal" star={vacancy.star} />
      <EvidenceRow value={`${pct}% of cycle`} benchmark={benchmark} />
    </div>
  );
}

/** Rent stability card — suppressed → muted/italic caveat; else value + benchmark + star. */
function RentStabilityCard({ rentStability }: { rentStability: NonNullable<OperatingView["rentStability"]> }) {
  if (rentStability.suppressed) {
    return (
      <div style={cardShellStyle}>
        <CardHeader title="Rent stability" star={null} />
        <div style={{ fontSize: "12px", color: "#8894ac", fontStyle: "italic" }}>
          {rentStability.reason}
        </div>
      </div>
    );
  }

  const volatility = fmt(rentStability.volatilityPP);
  const benchmark =
    rentStability.cohortMedianPP != null ? `cohort median ${fmt(rentStability.cohortMedianPP)} pp` : "";
  return (
    <div style={cardShellStyle}>
      <CardHeader title="Rent stability" star={rentStability.star} />
      <EvidenceRow value={`${volatility} pp YoY stdev`} benchmark={benchmark} />
    </div>
  );
}

/** Small pill chip for concession patterns (e.g. "1 month free"). */
function PatternChip({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: "11px",
        padding: "3px 9px",
        borderRadius: "20px",
        border: "1px solid #e0e5ee",
        display: "inline-block",
        color: "#5b6577",
      }}
    >
      {label}
    </span>
  );
}

/** Concession card — value/benchmark row + pattern chips + up to 3 muted sample quotes. */
function ConcessionCard({ concession }: { concession: NonNullable<OperatingView["concession"]> }) {
  const rate = fmt(concession.ratePct);
  const benchmark =
    concession.marketMedianPct != null ? `market median ${fmt(concession.marketMedianPct)}%` : "";
  const samples = concession.samples.slice(0, 3);

  return (
    <div style={cardShellStyle}>
      <CardHeader title="Concessions" star={null} />
      <EvidenceRow value={`${rate}% of listings`} benchmark={benchmark} />

      {concession.patterns.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            marginTop: "11px",
          }}
        >
          {concession.patterns.map((p) => (
            <PatternChip key={p} label={p} />
          ))}
        </div>
      )}

      {samples.length > 0 && (
        <div
          style={{
            marginTop: "9px",
            paddingTop: "9px",
            borderTop: "1px solid #f0f2f6",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {samples.map((s, i) => (
            <blockquote
              key={i}
              style={{
                margin: 0,
                paddingLeft: "10px",
                borderLeft: "2px solid #e2e7ef",
                fontSize: "11.5px",
                color: "#8894ac",
                fontStyle: "italic",
              }}
            >
              {s}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "02 Operating Performance" section:
 *  - Numbered header + sectionLabel chip
 *  - Takeaway banner
 *  - Strongest / Watch chip row
 *  - One evidence card per metric
 */
export function OperatingPerformanceSection({ operating }: OperatingPerformanceSectionProps) {
  return (
    <div
      id="operating-performance"
      className="dq-section"
      style={{ borderTop: "2px solid #eef1f6", padding: "20px 0 6px" }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            color: "#aab3c6",
            fontWeight: 700,
          }}
        >
          02
        </span>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#0f1f3f",
          }}
        >
          Operating Performance
        </span>
        <LabelChip label={operating.sectionLabel} />
      </div>

      {/* Takeaway */}
      <div
        style={{
          background: "#f7f9fc",
          borderLeft: "3px solid #1b6e8c",
          padding: "9px 12px",
          borderRadius: "0 6px 6px 0",
          color: "#2a3547",
          margin: "6px 0 14px",
          fontSize: "12.5px",
        }}
      >
        {operating.takeaway}
      </div>

      {/* Strongest / Watch chip row */}
      <SwChipRow strongest={operating.strongest} watch={operating.watch} />

      {/* Evidence cards */}
      {operating.metrics.map((metric) => (
        <MetricCard key={metric.key} metric={metric} />
      ))}

      {/* Restored metrics: vacancy / rent stability / concession detail */}
      {operating.vacancy && <VacancyCard vacancy={operating.vacancy} />}
      {operating.rentStability && <RentStabilityCard rentStability={operating.rentStability} />}
      {operating.concession && <ConcessionCard concession={operating.concession} />}
    </div>
  );
}
