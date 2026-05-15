import Link from "next/link";
import {
  QUADRANT_SEGMENTS,
  segmentLabel,
  type QuadrantSegment,
} from "@/lib/slugify";

export function FilterChips({
  stateSlug,
  citySlug,
  active,
  countsBySegment,
}: {
  stateSlug: string;
  citySlug: string;
  active: QuadrantSegment | null;
  countsBySegment: Partial<Record<QuadrantSegment, number>>;
}) {
  const baseHref = `/property-managers/${stateSlug}/${citySlug}`;
  const totalCount = Object.values(countsBySegment).reduce(
    (acc, n) => acc + (n ?? 0),
    0
  );

  const chips: Array<{
    label: string;
    href: string;
    count: number;
    isActive: boolean;
  }> = [
    {
      label: "All operators",
      href: baseHref,
      count: totalCount,
      isActive: active === null,
    },
    ...QUADRANT_SEGMENTS.map((seg) => ({
      label: segmentLabel(seg),
      href: `${baseHref}/${seg}`,
      count: countsBySegment[seg] ?? 0,
      isActive: active === seg,
    })),
  ];

  return (
    <nav
      aria-label="Filter by operator type"
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          aria-current={chip.isActive ? "page" : undefined}
          className={
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors " +
            (chip.isActive
              ? "border-foreground bg-foreground text-background"
              : chip.count === 0
                ? "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                : "border-border bg-card text-foreground hover:bg-muted")
          }
        >
          <span>{chip.label}</span>
          <span
            className={
              "rounded-full px-1.5 py-0.5 text-xs tabular-nums " +
              (chip.isActive
                ? "bg-background/15 text-background"
                : "bg-muted text-muted-foreground")
            }
          >
            {chip.count}
          </span>
        </Link>
      ))}
    </nav>
  );
}
