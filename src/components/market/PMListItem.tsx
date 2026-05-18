import { TrackedLink } from "@/components/analytics/TrackedLink";
import { fmtDays, fmtInt } from "@/lib/format";
import { quadrantColor } from "@/lib/quadrant-colors";
import type { PMListItem as PMListItemData, StarLevel } from "@/lib/types";

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
}: {
  pm: PMListItemData;
  stateSlug: string;
  citySlug: string;
}) {
  const href = `/property-managers/${stateSlug}/${citySlug}/${pm.slug}`;
  const color = quadrantColor(pm.quadrant);
  const rent = fmtSignedPct(pm.rentVsComp);
  const cityShare = pm.primaryCityShare;

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
              <ListItemStar level={pm.compositeStar} />
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
              {pm.rankQuadrant !== null && pm.rankQuadrantTotal !== null && (
                <span className="dq-mono inline-flex h-[22px] items-center gap-1 rounded-full border border-grid bg-white px-2.5 text-[11px] font-medium text-muted-foreground">
                  Rank {pm.rankQuadrant} of {pm.rankQuadrantTotal}
                </span>
              )}
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
              {cityShare !== null ? `${cityShare}% ` : ""}
              {pm.primaryCity}
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

// Composite star icon — surfaced next to the PM name on the market list.
// Matches the sizing + color encoding used inside scorecard layers.
function ListItemStar({ level }: { level: StarLevel }) {
  const isGold = level === "gold";
  const isSilver = level === "silver";
  if (!isGold && !isSilver) {
    // No star → render a small placeholder dot so the row alignment stays
    // consistent with starred rows. Muted, no aria label.
    return (
      <span
        aria-hidden
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center"
      >
        <span className="h-1 w-1 rounded-full bg-muted-2/60" />
      </span>
    );
  }
  const fill = isGold ? "#E5A800" : "#9CA3AF";
  const stroke = isGold ? "#B98700" : "#6B7280";
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-label={
        isGold ? "Gold composite star" : "Silver composite star"
      }
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}
