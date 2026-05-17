import Link from "next/link";
import {
  QUADRANT_ORDER,
  QUADRANT_COLORS,
  colorKeyToSegment,
  type QuadrantColorKey,
} from "@/lib/quadrant-colors";
import { fmtDays, fmtInt } from "@/lib/format";

type QuadrantStats = {
  count: number;
  medianDomT12: number | null;
};

// Each PM-quadrant string in the DB summary maps to one of the four color keys.
const DB_QUADRANT_KEYS: Record<QuadrantColorKey, string> = {
  "mfbtr-inst": "MF/BTR / Institutional",
  "mfbtr-ind": "MF/BTR / Independent",
  "scattered-inst": "Scattered / Institutional",
  "scattered-ind": "Scattered / Independent",
  hybrid: "Hybrid",
};

function QuadrantTile({
  colorKey,
  stats,
  marketHref,
}: {
  colorKey: QuadrantColorKey;
  stats: QuadrantStats;
  marketHref: string;
}) {
  const color = QUADRANT_COLORS[colorKey];
  const empty = stats.count === 0;
  const segment = colorKeyToSegment(colorKey);
  const filterHref = `${marketHref}/${segment}`;

  const card = (
    <div
      className={
        "group flex h-full min-h-[200px] flex-col justify-between rounded-lg border border-grid bg-white p-6 transition-all duration-150 " +
        (empty
          ? "opacity-55"
          : "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgb(15_31_63_/_0.18),_0_2px_6px_rgb(15_31_63_/_0.06)]")
      }
    >
      <span
        className="dq-badge inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]"
        style={{ color: color.fg, backgroundColor: color.soft }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color.fg }}
        />
        {color.label}
      </span>

      <div className="mt-4 flex-1">
        <p className="dq-mono text-[40px] font-medium leading-none text-navy tracking-[-0.01em]">
          {fmtInt(stats.count)}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          operator{stats.count === 1 ? "" : "s"}
        </p>
        <div className="mt-4">
          {empty ? (
            <p className="text-[13px] italic text-muted-foreground">
              No operators in this segment yet.
            </p>
          ) : (
            <>
              <p className="dq-mono text-[14px] text-navy">
                {fmtDays(stats.medianDomT12)}
              </p>
              <p className="text-xs text-muted-foreground">
                median DOM, T12
              </p>
            </>
          )}
        </div>
      </div>

      <p
        className={
          "mt-6 text-[13px] font-semibold " +
          (empty
            ? "text-muted-2"
            : "text-teal group-hover:text-teal-700 group-hover:underline")
        }
      >
        {empty ? "—" : "View operators →"}
      </p>
    </div>
  );

  if (empty) return card;
  return (
    <Link href={filterHref} aria-label={`View ${color.label} operators`}>
      {card}
    </Link>
  );
}

export function QuadrantSummaryCard({
  summary,
  marketHref,
}: {
  summary: Record<string, QuadrantStats>;
  marketHref: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {QUADRANT_ORDER.map((key) => {
        const dbKey = DB_QUADRANT_KEYS[key];
        const stats = summary[dbKey] ?? { count: 0, medianDomT12: null };
        return (
          <QuadrantTile
            key={key}
            colorKey={key}
            stats={stats}
            marketHref={marketHref}
          />
        );
      })}
    </div>
  );
}
