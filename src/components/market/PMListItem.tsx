import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Badge } from "@/components/ui/badge";
import { fmtDays, fmtInt } from "@/lib/format";
import type { PMListItem as PMListItemData } from "@/lib/types";

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
  return (
    <li className="grid grid-cols-[40px_1fr_auto] items-center gap-4 p-4 hover:bg-muted/40">
      <div className="text-sm font-semibold text-muted-foreground tabular-nums">
        #{pm.rankOverall ?? "—"}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TrackedLink
            event="pm_card_click"
            properties={{
              pmSlug: pm.slug,
              rank: pm.rankOverall,
              source: "market_list",
            }}
            href={href}
            className="text-base font-medium hover:underline"
          >
            {pm.name}
          </TrackedLink>
          <Badge variant="secondary">{pm.quadrant}</Badge>
          {pm.hybrid && <Badge variant="outline">Hybrid</Badge>}
          {pm.claimed && <Badge variant="outline">Claimed</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {pm.primaryCity} · {fmtInt(pm.totalObservedUnits)} units observed
          {pm.rankQuadrant !== null && (
            <> · #{pm.rankQuadrant} in quadrant</>
          )}
        </p>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium tabular-nums">
          {fmtDays(pm.domT12)}
        </div>
        <div className="text-xs text-muted-foreground">DOM T12</div>
      </div>
    </li>
  );
}
