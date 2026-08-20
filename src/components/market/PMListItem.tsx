import { GatedLink } from "@/components/auth/GatedLink";
import { fmtDays, fmtInt } from "@/lib/format";
import { sizeBandLabel } from "@/lib/operator-size-bands";
import { quadrantColor } from "@/lib/quadrant-colors";
import { managementModelLabel } from "@/lib/management-model/resolve";
import { StarSummaryChip } from "@/components/scorecard/StarSummaryChip";
import { AddToWatchList } from "@/components/watch-list/AddToWatchList";
import type { PMListItem as PMListItemData } from "@/lib/types";

/** "May 27, 2026" from a plain YYYY-MM-DD, parsed as UTC so it can't slip a
 *  day for anyone west of GMT. */
function fmtListingDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

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
  selection,
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
  /** Task 4 — market roster multi-select checkbox (RankedOperatorList's
   *  "Select" mode). Optional and OFF by default: every existing/other
   *  caller of PMListItem renders exactly as before. When present, a
   *  checkbox is mounted in the card's top-LEFT corner — a sibling of the
   *  AddToWatchList corner control below, and likewise NOT nested inside
   *  GatedLink (same reason: GatedLink renders either an <a> or a
   *  sign-in <button>, and an interactive control nested inside either
   *  is invalid HTML and would fight the row's click-to-navigate). */
  selection?: {
    selected: boolean;
    onToggle: () => void;
  };
}) {
  const href = `/property-managers/${stateSlug}/${citySlug}/${pm.slug}`;
  const color = quadrantColor(pm.quadrant);
  const rent = fmtSignedPct(pm.rentVsComp);
  // Submarket filter active → render submarket share + name; otherwise
  // render the existing primary-city share + market city.
  const displayShare = submarket ? submarket.share : pm.primaryCityShare;
  const displayCity = submarket ? submarket.displayName : pm.primaryCity;

  // Management model: label plus the confidence + basis behind it on hover,
  // matching how the scorecard header presents the same value.
  const mm = pm.managementModel ?? null;
  const mmLabel = managementModelLabel(mm?.model);
  const mmTitle = mm
    ? mm.confidence
      ? `${mm.confidence[0].toUpperCase()}${mm.confidence.slice(1)} confidence · ${mm.basis}`
      : mm.basis
    : undefined;

  const rentToneClass =
    rent.tone === "good"
      ? "text-good"
      : rent.tone === "bad"
        ? "text-orange"
        : "text-navy";

  // v0.6.4 Patch 3 — DOM color now reflects cohort-relative performance,
  // not quadrant identity. Previously `style={{ color: color.fg }}` tinted
  // the DOM number with the quadrant badge color (MF/BTR Inst → green,
  // Scattered/Indep → orange, etc.) which the eye reads as a performance
  // signal: green = good, orange = bad. The intent was just a visual tie
  // to the quadrant pill above, but it produced false signals (two
  // operators with identical DOM and identical cohort-relative standing
  // showed opposite-direction colors because they were in different
  // quadrants). Now: gold/silver star → green ("top-tier DOM for this
  // cohort"), null → neutral navy. Matches the rent-vs-comp column's
  // semantic-coloring pattern.
  // Concession tone mirrors the scorecard's watch-item tiering: heavy
  // discounting (>=40%) is the threshold where it stops being seasonal noise
  // and starts being a lease-up signal worth noticing. Neutral below that —
  // some concession use is normal and colouring it red would cry wolf.
  const concessionToneClass =
    pm.concessionRate != null && pm.concessionRate >= 0.4
      ? "text-orange"
      : "text-navy";

  const domToneClass =
    pm.domStar === "gold" || pm.domStar === "silver"
      ? "text-good"
      : "text-navy";

  return (
    <li className="relative list-none">
      {/* Mounted as a sibling of GatedLink, not nested inside it — the
          link renders either an <a> or (signed-out) a <button>, and
          nesting an interactive control inside either is invalid HTML
          and would fight the row's own click-to-navigate behavior.
          Absolutely positioned in the card's top-right corner so it
          overlays the (non-interactive) padding area. */}
      <div className="absolute right-4 top-4 z-10">
        <AddToWatchList
          memberKey={pm.canonicalOperatorId ?? pm.slug}
          operatorName={pm.displayName ?? pm.name}
          compact
        />
      </div>
      {selection && (
        <div className="absolute left-4 top-4 z-10">
          <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-grid bg-white transition-colors hover:border-navy">
            <input
              type="checkbox"
              checked={selection.selected}
              onChange={selection.onToggle}
              aria-label={`Select ${pm.displayName ?? pm.name}`}
              className="size-3.5 cursor-pointer accent-teal"
            />
          </label>
        </div>
      )}
      <GatedLink
        event="pm_card_click"
        properties={{
          pmSlug: pm.slug,
          rank: pm.rankOverall,
          source: "market_list",
        }}
        href={href}
        ariaLabel={`View ${pm.name}'s scorecard`}
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
              {/* v0.6.4 Patch 3 — DBA display-name fallback. pm.displayName
                  carries the canonical operating-company name when it
                  differs from the raw CSV name (the Haven Residential
                  → 29th Street Property Management case). pm.name stays
                  the source-of-truth raw label, surfaced anywhere we
                  intentionally want the listing-level marketing string. */}
              <span className="text-[22px] font-semibold leading-tight text-navy tracking-[-0.012em]">
                {pm.displayName ?? pm.name}
              </span>
              {/* v0.8 dormant tier — states the observed fact only. The row
                  otherwise renders identically, because the operator's T12
                  record is real; what changed is that it stopped updating. */}
              {pm.operatorStatus === "dormant" && (
                <span className="dq-badge inline-flex items-center rounded-full border border-[#F3D7B3] bg-orange-soft px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] text-orange-700">
                  Dormant
                </span>
              )}
              {/* Inferred hireability. An owner scanning a market first needs
                  to know which of these they can actually engage — that signal
                  already exists on the scorecard, the watch list and the PDF,
                  and was the one thing missing from the row that precedes them
                  all. "Unknown" is rendered too, and deliberately: it means
                  verify directly, not "no", and hiding it would read as an
                  answer we don't have. Owner-operator always carries its
                  "(likely)" hedge from the shared label map. */}
              {mmLabel && (
                <span
                  title={mmTitle}
                  className="dq-badge inline-flex items-center rounded-full border border-grid bg-white px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] text-muted-foreground"
                >
                  {mmLabel}
                </span>
              )}
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
              {/* Banded, not a point — the rankings list puts this figure
                  side by side with dozens of others, which is exactly where a
                  false sense of precision compounds. */}
              <span className="mx-1.5 text-muted-2">·</span>est.{" "}
              <span className="dq-mono font-medium text-navy/90">
                {sizeBandLabel(pm.estManagedUnits ?? pm.totalObservedUnits) ??
                  fmtInt(pm.estManagedUnits ?? pm.totalObservedUnits)}
              </span>{" "}
              managed units
              {pm.operatorStatus === "dormant" && pm.lastListingDate && (
                <>
                  <span className="mx-1.5 text-muted-2">·</span>
                  <span className="whitespace-nowrap">
                    last listing {fmtListingDate(pm.lastListingDate)}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Middle: mini-metrics. The concession column was hidden while the
              pipeline sourced no concession data — it would have rendered "—"
              universally and read as a data gap. Every seeded operator now
              carries a rate, so it earns its place. Shown only when the
              operator has one: a real 0% ("advertises none") and a missing
              value are different claims, and "—" for the latter is honest. */}
          <div className="grid grid-cols-3 gap-5">
            <MiniMetric
              label="DOM (T12)"
              value={fmtDays(pm.domT12)}
              className={"dq-mono " + domToneClass}
            />
            <MiniMetric
              label="Rent vs comp"
              value={rent.text}
              className={"dq-mono " + rentToneClass}
            />
            <MiniMetric
              label="Concessions"
              value={
                pm.concessionRate === null || pm.concessionRate === undefined
                  ? "—"
                  : `${Math.round(pm.concessionRate * 100)}%`
              }
              className={"dq-mono " + concessionToneClass}
            />
          </div>

          {/* Right: CTA */}
          <div className="text-right text-[14px] font-semibold text-navy">
            View scorecard <span className="text-teal">→</span>
          </div>
        </div>
      </GatedLink>
    </li>
  );
}

// StarSummaryChip + StarGlyph were extracted to
// @/components/scorecard/StarSummaryChip when the scorecard hero (Layer
// 1) adopted the same chip pattern at a larger scale. The list row uses
// the default size="md"; the hero uses size="lg".
