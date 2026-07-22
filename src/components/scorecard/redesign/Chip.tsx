// Shared identity chip for the scorecard header — one consistent style for
// every "fact about the operator" (type, management model, market + scope).
// Pure server component. Distinct from LabelChip (the score-VALUE status
// pill): this carries neutral descriptive facts, not a good/bad tone.

import type { ReactNode } from "react";

interface ChipProps {
  children: ReactNode;
  /** Leading cohort dot — used by the operator-type chip. */
  dot?: boolean;
  /** Trailing ⓘ affordance; its text is exposed via title + aria-label. */
  infoTitle?: string;
  /** Native tooltip on the whole chip. */
  title?: string;
}

export function Chip({ children, dot = false, infoTitle, title }: ChipProps) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        fontWeight: 600,
        color: "#4a5568",
        background: "#f1f4f8",
        border: "1px solid #e2e8f0",
        borderRadius: "6px",
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#155772",
            flexShrink: 0,
          }}
        />
      )}
      {children}
      {infoTitle && (
        <span
          title={infoTitle}
          aria-label={infoTitle}
          style={{ color: "#8a94a6", cursor: "help", fontSize: "11px" }}
        >
          ⓘ
        </span>
      )}
    </span>
  );
}
