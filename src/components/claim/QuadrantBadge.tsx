// Inline pill with a 6px color dot prefix, scoped to the Claim portal's
// warm-cream surfaces. The 4 quadrant variants use earth-toned color pairs
// that read on cream backgrounds (the public scorecard's quadrant palette is
// brighter and tuned for white/cool surfaces — see lib/quadrant-colors.ts).
//
// Variants are keyed by the DB quadrant string so we don't introduce a new
// classification taxonomy here; the mapping mirrors quadrant-colors.ts.

type QuadrantKey = "ss-ind" | "ss-inst" | "mf-ind" | "mf-inst";

type Variant = {
  bg: string;
  fg: string;
  dot: string;
  border: string;
};

const VARIANTS: Record<QuadrantKey, Variant> = {
  "ss-ind": {
    bg: "#f3e2d2",
    fg: "#6b3613",
    dot: "#b3592a",
    border: "rgba(179, 89, 42, 0.18)",
  },
  "ss-inst": {
    bg: "#e6dfee",
    fg: "#3a2654",
    dot: "#5b3f7a",
    border: "rgba(91, 63, 122, 0.18)",
  },
  "mf-ind": {
    bg: "#d8ebec",
    fg: "#0d5159",
    dot: "#1f7a85",
    border: "rgba(31, 122, 133, 0.18)",
  },
  "mf-inst": {
    bg: "#dde1ea",
    fg: "#0b1733",
    dot: "#0b1733",
    border: "rgba(11, 23, 51, 0.18)",
  },
};

function keyForQuadrant(quadrant: string): QuadrantKey {
  const lower = quadrant.toLowerCase();
  if (lower.includes("mf") || lower.includes("btr")) {
    return lower.includes("institutional") ? "mf-inst" : "mf-ind";
  }
  return lower.includes("institutional") ? "ss-inst" : "ss-ind";
}

export function QuadrantBadge({
  quadrant,
  className = "",
}: {
  quadrant: string;
  className?: string;
}) {
  const v = VARIANTS[keyForQuadrant(quadrant)];
  return (
    <span
      className={
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-[11px] py-[5px] pl-[9px] text-[12px] font-medium leading-none " +
        className
      }
      style={{
        background: v.bg,
        color: v.fg,
        borderColor: v.border,
      }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: v.dot }}
      />
      {quadrant}
    </span>
  );
}
