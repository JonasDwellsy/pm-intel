import { TrackedLink } from "@/components/analytics/TrackedLink";
import { fmtDays, fmtInt } from "@/lib/format";
import { quadrantColor } from "@/lib/quadrant-colors";
import type { PMListItem as PMListItemData } from "@/lib/types";

function fmtSignedPct(n: number | null): {
  text: string;
  tone: "good" | "bad" | "flat";
} {
  if (n === null) return { text: "—", tone: "flat" };
  const minus = "−"; // U+2212 minus sign — never a hyphen
  if (n > 0)
    return { text: `+${n.toFixed(1)}%`, tone: "good" };
  if (n < 0)
    return { text: `${minus}${Math.abs(n).toFixed(1)}%`, tone: "bad" };
  return { text: "0.0%", tone: "flat" };
}

function MiniMetric({
  label,
  value,
  className = "",
  style,
}: {
  label: string;
  value: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div>
      <p className="dq-eyebrow-muted mb-1.5 text-[10.5px]">{label}</p>
      <p className={"text-[18px] font-medium leading-none " + className} style={style}>
        {value}
      </p>
    </div>
  );
}

export function PMListItem({
  pm,
  stateSlug,
  citySlug,
  submarket,
}: {
  pm: PMListItemData;
  stateSlug: string;
  citySlug: string;
  /** When the parent market view has a submarket filter active, the row
   *  subtitle swaps the operator's primary-city share for their share in
   *  the filtered submarket — e.g. "60% Mesa" instead of "40% Phoenix" —
   *  so the percentage stays semantically aligned with the page filter.
   *  Resolved against topCitySlugs + topCityPcts in the parent; passed
   *  here as already-resolved share + display name so the component stays
   *  unaware of the data-lookup mechanics. Falls back to silent (no
   *  percentage prefix) when the share can't be resolved — silent reads
   *  cleaner than a misleading MSA percentage attached to a submarket
   *  label. */
  submarket?: {
    displayName: string;
    share: number | null;
  } | null;
}) {
  const href = `/property-managers/${stateSlug}/${citySlug}/${pm.slug}`;
  const color = quadrantColor(pm.quadrant);
  const rent = fmtSignedPct(pm.rentVsComp);
  // Submarket filter active → render submarket share + name; otherwise
  // render the existing primary-city share + market city.
  const displayShare = submarket ? submarket.share : pm.primaryCityShare;
  const displayCity = submarket ? submarket.displayName : pm.primaryCity;

  const rentToneClass =
    rent.tone === "good"
      ? "text-good"
      : rent.tone === "bad"
        ? "text-orange"
        : "text-navy";

  return (
    <li className="list-none">
      <TrackedLink
        event="pm_card_click"
        properties={{
          pmSlug: pm.slug,
          rank: pm.rankOverall,
          source: "market_list",
        }}
        href={href}
        className="block rounded-lg border border-grid bg-white p-6 px-7 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgb(15_31_63_/_0.18),_0_2px_6px_rgb(15_31_63_/_0.06)]"
      >
        <div className="grid items-center gap-8 md:grid-cols-[1.35fr_1.1fr_auto]">
          {/* Left: identity */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              {/* v0.6.3 Patch 4 — single composite-star icon replaced with a
                  ★N ☆M summary chip showing this operator's gold + silver
                  counts across the Layer 3 per-metric scoring. Drives the
                  same sort that orders the list (gold desc, silver desc,
                  composite asc), so the row's star count visually predicts
                  its position. Operators with zero of either get no chip —
                  the row identity stays clean. */}
              <StarSummaryChip
                goldCount={pm.goldCount ?? 0}
                silverCount={pm.silverCount ?? 0}
              />
              <span className="text-[22px] font-semibold leading-tight text-navy tracking-[-0.012em]">
                {pm.name}
              </span>
              <span
                className="dq-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]"
                style={{ color: color.fg, backgroundColor: color.soft }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color.fg }}
                />
                {color.label}
              </span>
              {/* v0.6.3 Patch 4 — "Rank N of M" pill removed. The visible
                  row order now communicates rank; the redundant pill added
                  visual clutter and competed with the new star chip. */}
              {pm.claimed && (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-good">
                  <span
                    className="h-[7px] w-[7px] rounded-full"
                    style={{ backgroundColor: color.fg ? "#2E8B57" : "#2E8B57" }}
                  />
                  Claimed profile
                </span>
              )}
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {displayShare !== null && displayShare !== undefined
                ? `${displayShare}% `
                : ""}
              {displayCity}
              <span className="mx-1.5 text-muted-2">·</span>
              <span className="dq-mono font-medium text-navy/90">
                {fmtInt(pm.totalObservedUnits)}
              </span>{" "}
              units observed
            </p>
          </div>

          {/* Middle: mini-metrics. Concession column hidden until v0.7
              sources concession rates — v0.6.2 surfaces no concession
              data, so the column rendered "—" universally and read as a
              data gap rather than the deferred state it actually is. */}
          <div className="grid grid-cols-2 gap-5">
            <MiniMetric
              label="DOM (T12)"
              value={fmtDays(pm.domT12)}
              className="dq-mono"
              style={{ color: color.fg }}
            />
            <MiniMetric
              label="Rent vs comp"
              value={rent.text}
              className={"dq-mono " + rentToneClass}
            />
          </div>

          {/* Right: CTA */}
          <div className="text-right text-[14px] font-semibold text-navy">
            View scorecard <span className="text-teal">→</span>
          </div>
        </div>
      </TrackedLink>
    </li>
  );
}

// v0.6.3 Patch 4 — gold / silver star summary chip rendered to the left of
// the PM name on the market list. Replaces the legacy single composite-
// star icon. Each side renders only when its count > 0; an operator with
// zero of both sides renders nothing so the row's identity strip stays
// uncluttered. The two icons share a single chip background so the visual
// reads as one unit; counts sit immediately to the right of each icon in
// dq-mono numerals.
//
// Color encoding matches the scorecard per-metric star palette: gold fill
// #E5A800 / stroke #B98700, silver fill #9CA3AF / stroke #6B7280. Stars
// are rendered at 14px (slightly smaller than the legacy 18px composite
// icon) so two icons + counts fit in roughly the same width as the
// previous single icon — avoids layout disruption.
function StarSummaryChip({
  goldCount,
  silverCount,
}: {
  goldCount: number;
  silverCount: number;
}) {
  if (goldCount === 0 && silverCount === 0) return null;
  return (
    <span
      aria-label={`${goldCount} gold star${goldCount === 1 ? "" : "s"}, ${silverCount} silver star${silverCount === 1 ? "" : "s"}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-grid bg-white px-2 py-0.5 text-[12px] font-semibold text-navy"
    >
      {goldCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="gold" />
          <span className="dq-mono">{goldCount}</span>
        </span>
      )}
      {silverCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="silver" />
          <span className="dq-mono">{silverCount}</span>
        </span>
      )}
    </span>
  );
}

function StarGlyph({ tone }: { tone: "gold" | "silver" }) {
  const fill = tone === "gold" ? "#E5A800" : "#9CA3AF";
  const stroke = tone === "gold" ? "#B98700" : "#6B7280";
  return (
    <svg
      width="14"
      height="14"
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
