import { MarketMapClient } from "./MarketMapClient";
import { quadrantColor, quadrantColorKey, type QuadrantColorKey } from "@/lib/quadrant-colors";
import type { LoadedMarket } from "@/lib/market-data";
import { fmtInt } from "@/lib/format";

export function MarketMap({ view }: { view: LoadedMarket }) {
  const { allPms, mapData, market } = view;

  // One pm-layer record per operator, with their points + quadrant color.
  const pmLayers = allPms.map((pm) => {
    const color = quadrantColor(pm.quadrant);
    return {
      slug: pm.slug,
      name: pm.name,
      quadrant: pm.quadrant,
      colorKey: quadrantColorKey(pm.quadrant),
      color: color.fg,
      points: pm.coverageMapPoints ?? [],
    };
  });

  // Total addresses plotted (sum of coverage points across all PMs).
  const totalPoints = pmLayers.reduce((sum, p) => sum + p.points.length, 0);

  // Operator counts per quadrant key — for the map legend.
  const legendCounts: Partial<Record<QuadrantColorKey, number>> = {};
  for (const pm of allPms) {
    const k = quadrantColorKey(pm.quadrant);
    legendCounts[k] = (legendCounts[k] ?? 0) + 1;
  }

  return (
    <section className="dq-section">
      <header className="mb-7">
        <p className="dq-eyebrow">Section 03</p>
        <h2 className="dq-h2 mt-1.5">Coverage map</h2>
        <div className="dq-section-rule" />
      </header>

      <MarketMapClient
        pmLayers={pmLayers}
        backdropPoints={mapData.msaBackdropPoints ?? []}
        mapBounds={mapData.mapBounds}
        msaName={market.fullName}
        legendCounts={legendCounts}
      />

      <p className="mt-3.5 max-w-[920px] text-[13px] italic leading-[1.6] text-muted-foreground">
        Each dot represents one observed listing address across all eligible
        operators in {market.fullName} over the trailing 12 months. Color
        indicates the operator&rsquo;s quadrant classification.{" "}
        <span className="dq-mono not-italic font-medium text-navy/85">
          {fmtInt(totalPoints)}
        </span>{" "}
        addresses plotted across{" "}
        <span className="dq-mono not-italic font-medium text-navy/85">
          {fmtInt(pmLayers.length)}
        </span>{" "}
        operators.
      </p>
    </section>
  );
}
