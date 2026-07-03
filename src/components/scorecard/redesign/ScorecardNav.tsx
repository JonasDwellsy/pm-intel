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
        width: "186px",
        borderLeft: "1px solid #e6eaf1",
        padding: "18px 14px",
        background: "#fafbfd",
        fontSize: "12px",
        flexShrink: 0,
        alignSelf: "flex-start",
        position: "sticky",
        top: "20px",
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
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "7px 8px",
                borderRadius: "6px",
                color: "#3a4a6b",
                textDecoration: "none",
                gap: "6px",
              }}
            >
              {/* Number + label */}
              <span style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
                <span style={{ color: "#aab3c6", fontWeight: 700, flexShrink: 0 }}>
                  {section.num}
                </span>
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {section.label}
                </span>
              </span>

              {/* Status chip */}
              {section.statusLabel && (
                <span style={{ flexShrink: 0 }}>
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
