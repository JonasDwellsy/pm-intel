"use client";

// Scorecard redesign — right-rail section nav.
// Client component (smooth-scroll via anchor href + optional active highlight).

import type { ScoreLabel } from "@/lib/scorecard/labels";
import { LabelChip } from "./LabelChip";

interface NavSection {
  id: string;
  label: string;
  num: string;
  /** ScoreLabel or an arbitrary string (e.g. a count). Renders as a LabelChip. */
  statusLabel?: ScoreLabel | string;
}

interface ScorecardNavProps {
  sections: NavSection[];
}

/**
 * Right-rail nav: numbered anchor links to each scorecard section,
 * with an optional small status chip per section.
 * Styled to match the .sc-nav panel in scorecard-v5.html.
 */
export function ScorecardNav({ sections }: ScorecardNavProps) {
  return (
    <nav
      aria-label="On this page"
      style={{
        // Stickiness is handled by the wrapper in ScorecardBody (the flex
        // child), which has room to stick; this panel is a plain box.
        width: "186px",
        borderLeft: "1px solid #e6eaf1",
        padding: "18px 14px",
        background: "#fafbfd",
        fontSize: "12px",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#aab3c6",
          marginBottom: "8px",
        }}
      >
        On this page
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              style={{
                display: "block",
                padding: "7px 8px",
                borderRadius: "6px",
                color: "#3a4a6b",
                textDecoration: "none",
              }}
            >
              {/* Number + label — label renders in full (wraps if ever needed,
                  never truncates) since the status chip sits on its own line. */}
              <span style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
                <span style={{ color: "#aab3c6", fontWeight: 700, flexShrink: 0 }}>
                  {section.num}
                </span>
                <span>{section.label}</span>
              </span>

              {/* Status chip — stacked under the label, indented to align with
                  the label text (past the number). Keeps the rail narrow while
                  letting labels + wide chips (e.g. DECLINING) both show fully. */}
              {section.statusLabel && (
                <span style={{ display: "inline-block", marginTop: "4px", marginLeft: "18px" }}>
                  <LabelChip label={section.statusLabel} />
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
