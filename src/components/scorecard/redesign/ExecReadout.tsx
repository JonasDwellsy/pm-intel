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
}

/**
 * 4-row bordered table: eyebrow "30-second readout" + one row per area.
 * Each area name links to its section anchor. LabelChip rendered when label set.
 */
export function ExecReadout({ readout, maturityNote }: ExecReadoutProps) {
  return (
    <div style={{ marginTop: "22px", marginBottom: "24px" }}>
      {/* Eyebrow */}
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#8894ac",
          fontWeight: 600,
          marginBottom: "6px",
        }}
      >
        30-second readout
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
                  fontSize: "12px",
                  marginRight: "6px",
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
