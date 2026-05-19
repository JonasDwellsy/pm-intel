import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import {
  QUADRANT_SEGMENTS,
  segmentLabel,
  type QuadrantSegment,
} from "@/lib/slugify";

type Chip = {
  label: string;
  href: string;
  count: number;
  isActive: boolean;
  segment: QuadrantSegment | "all";
};

function ChipBody({
  chip,
  zero,
}: {
  chip: Chip;
  zero: boolean;
}) {
  return (
    <span
      className={
        "inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-[140ms] " +
        (chip.isActive
          ? "border border-navy bg-navy text-white"
          : zero
            ? "border border-grid-soft bg-white text-muted-foreground"
            : "border border-grid bg-white text-navy hover:border-navy")
      }
    >
      <span>{chip.label}</span>
      <span
        className={
          "dq-mono rounded-full px-2 py-[2px] text-[11px] leading-none " +
          (chip.isActive
            ? "bg-white/15 text-white/85"
            : zero
              ? "bg-surface-soft text-muted-2"
              : "bg-surface-soft text-muted-foreground")
        }
      >
        {chip.count}
      </span>
    </span>
  );
}

export function FilterChips({
  stateSlug,
  citySlug,
  marketId,
  active,
  countsBySegment,
  submarketSlug,
}: {
  stateSlug: string;
  citySlug: string;
  marketId: string;
  active: QuadrantSegment | null;
  countsBySegment: Partial<Record<QuadrantSegment, number>>;
  /** When set, every chip preserves the submarket filter via a `?submarket=`
   *  query so clicking a chip narrows the filtered universe by segment
   *  rather than dropping back to the MSA-wide list. */
  submarketSlug?: string | null;
}) {
  const baseHref = `/property-managers/${stateSlug}/${citySlug}`;
  const submarketQuery = submarketSlug
    ? `?submarket=${encodeURIComponent(submarketSlug)}`
    : "";
  const totalCount = Object.values(countsBySegment).reduce(
    (acc, n) => acc + (n ?? 0),
    0
  );

  const chips: Chip[] = [
    {
      label: "All operators",
      href: `${baseHref}${submarketQuery}`,
      count: totalCount,
      isActive: active === null,
      segment: "all",
    },
    ...QUADRANT_SEGMENTS.map((seg) => ({
      label: segmentLabel(seg),
      href: `${baseHref}/${seg}${submarketQuery}`,
      count: countsBySegment[seg] ?? 0,
      isActive: active === seg,
      segment: seg as QuadrantSegment | "all",
    })),
  ];

  return (
    <nav
      aria-label="Filter by operator type"
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => {
        const zero = chip.count === 0 && !chip.isActive;
        // Zero-state chips are non-interactive — render a plain span so users
        // can't click into an empty filter.
        if (zero) {
          return (
            <span
              key={chip.label}
              aria-disabled="true"
              className="cursor-default"
            >
              <ChipBody chip={chip} zero />
            </span>
          );
        }
        // Active chip → plain Link (no event noise on the page the user is
        // already on). Other enabled chips → tracked event on navigate.
        if (chip.isActive) {
          return (
            <Link
              key={chip.label}
              href={chip.href}
              aria-current="page"
            >
              <ChipBody chip={chip} zero={false} />
            </Link>
          );
        }
        return (
          <TrackedLink
            key={chip.label}
            event="quadrant_filter_click"
            properties={{ marketId, segment: chip.segment }}
            href={chip.href}
          >
            <ChipBody chip={chip} zero={false} />
          </TrackedLink>
        );
      })}
    </nav>
  );
}
