// Scorecard redesign — Geographic concentration stacked bar.
// Pure server component; no client hooks.
// Matches the mockup .stack (stacked top-cities bar) layout.

import type { ScaleFitView } from "@/lib/scorecard/view-model";

interface ConcentrationBarProps {
  topCities: ScaleFitView["topCities"];
  top3Share: ScaleFitView["top3Share"];
  cohortTop3: ScaleFitView["cohortTop3"];
}

// A palette of teal shades for up to 4 city segments.
// The "other" segment uses a lighter/desaturated tone.
const CITY_COLORS = [
  { bg: "#155772", text: "#fff" },
  { bg: "#1b6e8c", text: "#fff" },
  { bg: "#4a90a8", text: "#fff" },
];
const OTHER_COLOR = { bg: "#9ec4d2", text: "#155772" };

/** Stacked horizontal bar of top cities + a concentration-vs-peers caption. */
export function ConcentrationBar({ topCities, top3Share, cohortTop3 }: ConcentrationBarProps) {
  if (!topCities || topCities.length === 0) {
    return (
      <p style={{ fontSize: "11px", color: "#8894ac", margin: 0 }}>
        Geographic breakdown not available.
      </p>
    );
  }

  // Slice to max 3 named cities; remainder goes to "other"
  const named = topCities.slice(0, 3);
  const namedSum = named.reduce((s, c) => s + c.pct, 0);
  const otherPct = Math.max(0, 100 - namedSum);

  // Concentration vs peers one-liner
  let concentrationLine: string | null = null;
  if (top3Share != null) {
    const topPct = Math.round(top3Share * 100);
    if (cohortTop3 != null) {
      const cohortPct = Math.round(cohortTop3 * 100);
      const delta = topPct - cohortPct;
      const direction =
        Math.abs(delta) <= 2 ? "in line with peers"
        : delta > 0 ? "more concentrated than peers"
        : "less concentrated than peers";
      concentrationLine = `Top-3 share ${topPct}% vs cohort median ${cohortPct}% — ${direction}.`;
    } else {
      concentrationLine = `Top-3 share ${topPct}% of portfolio.`;
    }
  }

  return (
    <div>
      {/* Stacked bar */}
      <div
        style={{
          display: "flex",
          height: "20px",
          borderRadius: "5px",
          overflow: "hidden",
          fontSize: "9px",
          color: "#fff",
          margin: "6px 0 4px",
        }}
      >
        {named.map((city, i) => {
          const color = CITY_COLORS[i] ?? CITY_COLORS[CITY_COLORS.length - 1];
          const pctRounded = Math.round(city.pct);
          const label = city.name.length > 10
            ? `${city.name.slice(0, 8)}. ${pctRounded}%`
            : `${city.name} ${pctRounded}%`;
          return (
            <div
              key={city.name}
              style={{
                width: `${city.pct}%`,
                background: color.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: color.text,
                overflow: "hidden",
                whiteSpace: "nowrap",
                minWidth: city.pct > 8 ? undefined : "0px",
              }}
            >
              {city.pct > 8 ? label : ""}
            </div>
          );
        })}
        {otherPct > 0 && (
          <div
            style={{
              width: `${otherPct}%`,
              background: OTHER_COLOR.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: OTHER_COLOR.text,
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {otherPct > 8 ? "other" : ""}
          </div>
        )}
      </div>

      {/* Caption */}
      {concentrationLine && (
        <p style={{ fontSize: "10.5px", color: "#8894ac", margin: 0 }}>
          {concentrationLine}
        </p>
      )}
    </div>
  );
}
