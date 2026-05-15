import Link from "next/link";
import { MarketHero } from "./MarketHero";
import { QuadrantSummaryCard } from "./QuadrantSummaryCard";
import { FilterChips } from "./FilterChips";
import { PMListItem } from "./PMListItem";
import { MarketMap } from "./MarketMap";
import type { LoadedMarket } from "@/lib/market-data";
import type { QuadrantSegment } from "@/lib/slugify";
import { segmentLabel } from "@/lib/slugify";

export function MarketView({
  view,
  activeSegment,
}: {
  view: LoadedMarket;
  activeSegment: QuadrantSegment | null;
}) {
  const {
    market,
    methodologyVersion,
    dataAsOf,
    filteredPms,
    countsBySegment,
    hybridCount,
    stateSlug,
    citySlug,
  } = view;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <MarketHero
            market={market}
            methodologyVersion={methodologyVersion}
            dataAsOf={dataAsOf}
          />

          <section aria-label="Filter operators">
            <FilterChips
              stateSlug={stateSlug}
              citySlug={citySlug}
              active={activeSegment}
              countsBySegment={countsBySegment}
            />
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-medium">
                {activeSegment
                  ? `Top operators · ${segmentLabel(activeSegment)}`
                  : "Top operators"}
              </h2>
              <span className="text-xs text-muted-foreground">
                Showing {filteredPms.length} of {view.allPms.length}
              </span>
            </div>
            {filteredPms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
                <p className="text-sm font-medium">
                  No operators in this segment yet.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Try another filter or{" "}
                  <Link
                    href={`/property-managers/${stateSlug}/${citySlug}`}
                    className="underline hover:text-foreground"
                  >
                    view all operators
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {filteredPms.map((pm) => (
                  <PMListItem
                    key={pm.slug}
                    pm={pm}
                    stateSlug={stateSlug}
                    citySlug={citySlug}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <QuadrantSummaryCard
            summary={market.quadrantSummary}
            hybridCount={hybridCount}
          />
          <MarketMap city={market.city} msaName={market.fullName} />
        </aside>
      </div>
    </main>
  );
}
