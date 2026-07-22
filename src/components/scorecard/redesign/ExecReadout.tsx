// Scorecard redesign — 30-second exec readout table.
// Pure server component; no client hooks.

import type { ReadoutRow } from "@/lib/scorecard/view-model";
import { LabelChip } from "@/components/scorecard/redesign/LabelChip";

/** Maps a ReadoutRow area to its section anchor href. */
const AREA_ANCHORS: Record<ReadoutRow["area"], string> = {
  "Scale & Fit": "#scale-fit",
  "Operating Performance": "#operating-performance",
  "Momentum": "#momentum",
  "Watch Items": "#watch-items",
};

/** Small muted area icon rendered before each row's label. */
const AREA_ICONS: Record<ReadoutRow["area"], string> = {
  "Scale & Fit": "⚖",
  "Operating Performance": "📊",
  "Momentum": "📈",
  "Watch Items": "⚑",
};

interface ExecReadoutProps {
  readout: ReadoutRow[];
  maturityNote?: string | null;
  /** Gold/silver star summary — relocated here from the header. Optional so
   *  the PDF's ExecReadout call (no stars) stays unchanged. */
  goldCount?: number;
  silverCount?: number;
}

/**
 * 4-row bordered table: eyebrow "30-second readout" + one row per area.
 * Each area name links to its section anchor. LabelChip rendered when label set.
 */
export function ExecReadout({ readout, maturityNote, goldCount, silverCount }: ExecReadoutProps) {
  return (
    <div style={{ marginTop: "22px", marginBottom: "24px" }}>
      {/* Eyebrow + relocated gold/silver star summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6px",
          gap: "12px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#8894ac",
            fontWeight: 600,
          }}
        >
          30-second readout
        </div>
        {goldCount != null && silverCount != null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid #ead9a8",
              background: "#fdf7e7",
              borderRadius: "20px",
              padding: "4px 11px",
              fontSize: "12px",
              color: "#7a5c12",
              fontWeight: 600,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {goldCount > 0 && (
              <span style={{ color: "#d4a017", letterSpacing: "1px" }}>
                {"★".repeat(goldCount)}
              </span>
            )}
            {goldCount} gold
            <span style={{ color: "#c9cfd8" }}>·</span>
            {silverCount > 0 && (
              <span style={{ color: "#9aa4b2", letterSpacing: "1px" }}>
                {"★".repeat(silverCount)}
              </span>
            )}
            {silverCount} silver
          </span>
        )}
      </div>

      {/* Bordered table */}
      <div
        style={{
          border: "1px solid #e0e5ee",
          borderRadius: "9px",
          overflow: "hidden",
        }}
      >
        {readout.map((row, i) => (
          <div
            key={row.area}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "11px 14px",
              borderTop: i === 0 ? "none" : "1px solid #eef1f6",
              background: i === 0 ? "#f7f9fc" : undefined,
            }}
          >
            {/* Area label — icon + link to section anchor */}
            <div style={{ width: "178px", flexShrink: 0, whiteSpace: "nowrap" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "20px",
                  textAlign: "center",
                  fontSize: "12px",
                  marginRight: "4px",
                  opacity: 0.75,
                }}
              >
                {AREA_ICONS[row.area]}
              </span>
              <a
                href={AREA_ANCHORS[row.area]}
                style={{
                  fontWeight: 600,
                  fontSize: "12px",
                  color: "#0f1f3f",
                  textDecoration: "none",
                }}
              >
                {row.area}
              </a>
            </div>

            {/* Value text */}
            <div
              style={{
                flex: 1,
                color: "#1e2a3d",
                fontSize: "13.5px",
              }}
            >
              {row.value}
            </div>

            {/* Label chip — only when label is set */}
            {row.label != null && <LabelChip label={row.label} />}
          </div>
        ))}
      </div>

      {/* Maturity note — shown when thin/early coverage */}
      {maturityNote != null && (
        <div style={{ fontSize: "11px", color: "#8894ac", marginTop: "7px" }}>
          ⓘ {maturityNote}
        </div>
      )}
    </div>
  );
}
