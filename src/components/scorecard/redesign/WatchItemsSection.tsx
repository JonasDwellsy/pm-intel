// Scorecard redesign — Watch Items section (04).
// Pure server component; no client hooks.
// Renders one .witem row per item per the scorecard-v5.html mockup.

import type { WatchItem, WatchItemKind } from "@/lib/scorecard/watch-items";

interface WatchItemsSectionProps {
  items: WatchItem[];
}

// ─── kind config ──────────────────────────────────────────────────────────────

const KIND_CONFIG: Record<
  WatchItemKind,
  { glyph: string; label: string; color: string; borderColor: string }
> = {
  risk: { glyph: "⚠️", label: "Risk", color: "#a13a3a", borderColor: "#c0504d" },
  data: { glyph: "⏳", label: "Data limitation", color: "#9a6a12", borderColor: "#c99a2e" },
  context: { glyph: "📍", label: "Context", color: "#5b6577", borderColor: "#9aa4b2" },
  positive: { glyph: "✅", label: "Positive", color: "#1a7f5a", borderColor: "#3f9c6d" },
};

// ─── single row ───────────────────────────────────────────────────────────────

function WatchItemRow({ item }: { item: WatchItem }) {
  const cfg = KIND_CONFIG[item.kind];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "150px 1fr",
        borderLeft: `4px solid ${cfg.borderColor}`,
        borderRadius: "0 8px 8px 0",
        background: "#fcfdfe",
        marginBottom: "10px",
        overflow: "hidden",
      }}
    >
      {/* Left type cell */}
      <div
        style={{
          padding: "14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "3px",
        }}
      >
        <span style={{ fontSize: "16px", lineHeight: 1 }}>{cfg.glyph}</span>
        <span
          style={{
            fontSize: "10.5px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Right body */}
      <div style={{ padding: "14px 16px 14px 4px" }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#0f1f3f",
            marginBottom: "3px",
          }}
        >
          {item.headline}
        </div>
        <div style={{ fontSize: "12.5px", color: "#465066" }}>{item.explanation}</div>

        {item.ask && (
          <div
            style={{
              fontSize: "12px",
              color: "#8a4b2a",
              background: "#fbf2ea",
              borderRadius: "6px",
              padding: "7px 10px",
              marginTop: "9px",
            }}
          >
            <b style={{ color: "#7a3f22" }}>Ask:</b> {item.ask}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── section ──────────────────────────────────────────────────────────────────

export function WatchItemsSection({ items }: WatchItemsSectionProps) {
  const reviewCount = items.filter((i) => i.kind !== "positive").length;

  return (
    <div
      id="watch-items"
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
        <span style={{ fontSize: "11px", color: "#aab3c6", fontWeight: 700 }}>04</span>
        <span style={{ fontSize: "16px", fontWeight: 700, color: "#0f1f3f" }}>
          Watch Items
        </span>
        {/* Count chip */}
        <span
          style={{
            fontSize: "10.5px",
            padding: "2px 8px",
            borderRadius: "20px",
            background: "#eef0f4",
            color: "#5b6577",
            fontWeight: 600,
          }}
        >
          {reviewCount} to review
        </span>
      </div>

      {/* Plain-English intro */}
      <p
        style={{
          fontSize: "12.5px",
          color: "#5b6577",
          margin: "0 0 14px",
          lineHeight: 1.5,
        }}
      >
        Signals that need a human read before you hire, monitor, or acquire — some are risks
        worth a follow-up, some are neutral context, some are positives. Not everything here
        is bad.
      </p>

      {/* Item rows */}
      {items.map((item, i) => (
        <WatchItemRow key={`${item.kind}-${i}`} item={item} />
      ))}
    </div>
  );
}
