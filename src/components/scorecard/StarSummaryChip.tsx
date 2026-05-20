// Shared star summary chip — renders "★N ☆M" with brand-tuned gold +
// silver glyphs. Used in two contexts at two scales:
//
//   - Market view Ranked Operators list row → size="md" (default)
//   - Scorecard Layer 1 (IdentityHero) → size="lg" (~1.5× scale)
//
// Both surfaces share the same identity philosophy from v0.6.3 Patch 4:
// star counts speak for themselves; no "Top quartile in cohort" prose,
// no "Gold star · Composite" prefix. The chip is the entire treatment.
//
// 0/0 collapses to null so the chip never shows for operators without
// any per-metric recognition — keeps row identity clean on the list
// surface and lets the cohort name stand alone on the hero surface.

export type StarSummaryChipSize = "md" | "lg";

export function StarSummaryChip({
  goldCount,
  silverCount,
  size = "md",
}: {
  goldCount: number;
  silverCount: number;
  size?: StarSummaryChipSize;
}) {
  if (goldCount === 0 && silverCount === 0) return null;

  const isLg = size === "lg";
  // Two coordinated scales. "md" reuses the values the PMListItem row
  // shipped under v0.6.3 Patch 4 verbatim; "lg" is roughly 1.5× across
  // glyph size, type size, padding, and gap so the chip reads as the
  // primary visual element of the hero composition.
  const wrapperClass = isLg
    ? "inline-flex items-center gap-2 rounded-full border border-grid bg-white px-3 py-1 text-[16px] font-semibold text-navy"
    : "inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-2 py-0.5 text-[12px] font-semibold text-navy";
  const innerGap = isLg ? "gap-1" : "gap-0.5";
  const glyphPx = isLg ? 20 : 14;

  return (
    <span
      aria-label={`${goldCount} gold star${goldCount === 1 ? "" : "s"}, ${silverCount} silver star${silverCount === 1 ? "" : "s"}`}
      className={wrapperClass}
    >
      {goldCount > 0 && (
        <span className={`inline-flex items-center ${innerGap}`}>
          <StarGlyph tone="gold" size={glyphPx} />
          <span className="dq-mono">{goldCount}</span>
        </span>
      )}
      {silverCount > 0 && (
        <span className={`inline-flex items-center ${innerGap}`}>
          <StarGlyph tone="silver" size={glyphPx} />
          <span className="dq-mono">{silverCount}</span>
        </span>
      )}
    </span>
  );
}

export function StarGlyph({
  tone,
  size = 14,
}: {
  tone: "gold" | "silver";
  size?: number;
}) {
  const fill = tone === "gold" ? "#E5A800" : "#9CA3AF";
  const stroke = tone === "gold" ? "#B98700" : "#6B7280";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}
