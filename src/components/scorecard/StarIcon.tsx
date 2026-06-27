import type { StarLevel } from "@/lib/types";

// Per-metric gold/silver/none star. Extracted from SynthesisLayer (v0.21)
// so the Synthesis tiles and the new grade strip render an identical mark.
// gold = top quartile in cohort, silver = above median, none = present.
export function StarIcon({
  level,
  size = 16,
}: {
  level: StarLevel;
  size?: number;
}) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  const fill = isGold ? "#E5A800" : isSilver ? "#9CA3AF" : "transparent";
  const stroke = isGold
    ? "#B98700"
    : isSilver
      ? "#6B7280"
      : "var(--color-muted-2)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-label={
        level === "gold"
          ? "Gold star — top quartile in cohort"
          : level === "silver"
            ? "Silver star — above median in cohort"
            : "No star — present in cohort"
      }
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}
