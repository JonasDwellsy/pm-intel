import Link from "next/link";
import { MarketHero } from "./MarketHero";
import { QuadrantSummaryCard } from "./QuadrantSummaryCard";
import { FilterChips } from "./FilterChips";
import { PMListItem } from "./PMListItem";
import { MarketMap } from "./MarketMap";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { buttonVariants } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import type { LoadedMarket } from "@/lib/market-data";
import type { QuadrantSegment } from "@/lib/slugify";
import { segmentLabel } from "@/lib/slugify";

// v0.6.3 polish Phase C — auto-generated "so what" intro paragraph for the
// Operator landscape section. Pulls structural insight from the per-7-cell
// summary (counts + median DOM + median rent vs comp) so the reader learns
// something about the market in two sentences instead of being walked
// through the methodology axes again. Falls back to a generic intro when
// the data is too thin to support an opinion (small markets with sparse
// cohort coverage — Clarksville is the edge case in the v0.6.3 footprint).
const STANDOUT_MIN_OPERATORS = 5;

function buildLandscapeIntro({
  marketCity,
  marketMedianDomT12,
  quadrant7CellSummary,
}: {
  marketCity: string;
  marketMedianDomT12: number;
  quadrant7CellSummary: Record<
    string,
    {
      count: number;
      medianDomT12: number | null;
      medianRentVsComp: number | null;
    }
  >;
}): string {
  const cells = Object.entries(quadrant7CellSummary).filter(
    ([, s]) => s.count > 0
  );
  if (cells.length === 0) {
    // Thin-market fallback — preserve the v0.6.2 generic intro pattern so
    // the section still reads cleanly even without any populated cells.
    return `Operators in ${marketCity} span the seven-cell taxonomy by portfolio composition (SFR vs Small vs Large MF/BTR) and ownership posture (Independent vs Institutional). Each tile shows the cohort size, lease velocity, and rent-vs-comp posture.`;
  }
  // Dominant pattern — the segment with the largest operator count.
  const dominant = cells.reduce((best, cur) =>
    cur[1].count > best[1].count ? cur : best
  );
  // Standout segment — fastest median DOM among cells with ≥5 operators.
  // Threshold guards against a 1-operator cell winning by accident.
  const domCandidates = cells.filter(
    ([, s]) => s.count >= STANDOUT_MIN_OPERATORS && s.medianDomT12 !== null
  );
  const fastest =
    domCandidates.length > 0
      ? domCandidates.reduce((best, cur) =>
          (cur[1].medianDomT12 ?? Infinity) < (best[1].medianDomT12 ?? Infinity)
            ? cur
            : best
        )
      : null;
  // Strongest growth — highest median rent vs comp among cells with ≥5
  // operators and a non-null rent value.
  const rentCandidates = cells.filter(
    ([, s]) => s.count >= STANDOUT_MIN_OPERATORS && s.medianRentVsComp !== null
  );
  const strongestGrowth =
    rentCandidates.length > 0
      ? rentCandidates.reduce((best, cur) =>
          (cur[1].medianRentVsComp ?? -Infinity) >
          (best[1].medianRentVsComp ?? -Infinity)
            ? cur
            : best
        )
      : null;

  const pieces: string[] = [];
  pieces.push(
    `${marketCity}'s operator landscape skews toward ${dominant[0]} (${dominant[1].count} operators, the largest cohort).`
  );
  if (fastest && fastest[1].medianDomT12 !== null) {
    pieces.push(
      `${fastest[0]} leases fastest (${fastest[1].medianDomT12.toFixed(1)} days median DOM vs ${marketMedianDomT12.toFixed(1)} days market-wide).`
    );
  }
  if (strongestGrowth && strongestGrowth[1].medianRentVsComp !== null) {
    const pct = strongestGrowth[1].medianRentVsComp;
    const sign = pct >= 0 ? "+" : "−";
    pieces.push(
      `${strongestGrowth[0]} shows the strongest rent trajectory at ${sign}${Math.abs(pct).toFixed(1)}% vs comp.`
    );
  }
  return pieces.join(" ");
}

function Breadcrumb({
  stateSlug,
  cityLabel,
}: {
  stateSlug: string;
  cityLabel: string;
}) {
  const stateName = stateSlug.replace(/-/g, " ").replace(/\b\w/g, (c) =>
    c.toUpperCase()
  );
  return (
    <nav
      aria-label="Breadcrumb"
      className="mx-auto flex max-w-[1320px] items-center gap-2 px-6 py-3.5 text-[12.5px] text-muted-foreground sm:px-14"
    >
      <Link href="/" className="hover:text-navy">
        Home
      </Link>
      <span className="text-muted-2">›</span>
      <Link href="/property-managers" className="hover:text-navy">
        Property managers
      </Link>
      <span className="text-muted-2">›</span>
      <span>{stateName}</span>
      <span className="text-muted-2">›</span>
      <span className="font-medium text-navy">{cityLabel}</span>
    </nav>
  );
}

function MarketCtaStrip({ marketName }: { marketName: string }) {
  return (
    <section className="bg-navy text-white">
      <div className="mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-6 px-6 py-12 sm:px-14 md:flex-row md:items-center">
        <div>
          <p
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "#7FB6CC" }}
          >
            Lead matching
          </p>
          <h3 className="max-w-[680px] text-[28px] font-semibold leading-[1.2] tracking-[-0.012em]">
            Don&apos;t see a fit? Get matched with a property manager in {marketName}.
          </h3>
        </div>
        <Link
          href="/get-matched"
          className={
            buttonVariants({ variant: "outline" }) +
            " h-11 border-[1.5px] border-white bg-transparent px-7 text-[15px] font-semibold text-white hover:bg-white hover:text-navy"
          }
        >
          Get matched →
        </Link>
      </div>
    </section>
  );
}

function MethodologyFooter({
  version,
  dataAsOf,
}: {
  version: string;
  dataAsOf: string;
}) {
  return (
    <div className="border-t border-grid bg-white">
      <p className="mx-auto max-w-[1320px] px-6 py-6 text-[12.5px] leading-[1.65] text-muted-foreground sm:px-14">
        Operators ranked by trailing-twelve-month median Days on Market
        within-quadrant. Data sufficiency requires{" "}
        <span className="dq-mono font-medium text-navy/85">≥30</span> listings
        in trailing 12 months. Within-quadrant ranking requires{" "}
        <span className="dq-mono font-medium text-navy/85">≥3</span> PMs in
        cohort. Methodology{" "}
        <span className="dq-mono font-medium text-navy/85">
          v{version.replace(/^v/, "")}
        </span>{" "}
        · Data as of{" "}
        <span className="dq-mono font-medium text-navy/85">
          {fmtDate(dataAsOf)}
        </span>{" "}
        ·{" "}
        <Link href="/methodology" className="font-medium text-teal hover:text-teal-700">
          Learn more →
        </Link>
      </p>
    </div>
  );
}

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
    stateSlug,
    citySlug,
    submarket,
    rankedPoolSize,
  } = view;

  const marketHref = `/property-managers/${stateSlug}/${citySlug}`;

  return (
    <>
      <TrackEvent
        event="market_page_view"
        properties={{
          marketId: market.id,
          segment: activeSegment ?? "all",
        }}
      />
      {/* Breadcrumb band */}
      <div className="border-b border-grid bg-white">
        <Breadcrumb stateSlug={stateSlug} cityLabel={market.city} />
      </div>

      {/* Hero band — white */}
      <section className="border-b border-grid bg-white">
        <div className="mx-auto max-w-[1320px] px-6 pb-16 pt-14 sm:px-14">
          <MarketHero
            market={market}
            methodologyVersion={methodologyVersion}
            dataAsOf={dataAsOf}
            submarket={submarket}
          />
        </div>
      </section>

      {/* Quadrant overview band — warm offwhite */}
      <section className="border-b border-grid bg-[#FAFAF8]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-14">
          <header className="mb-7">
            {/* v0.6.3 polish — "Section 01" / "Section 02" eyebrow prefixes
                are stripped from the market landing page. The titles
                ("Operator landscape", "Ranked operators") stand alone here;
                the scorecard pages keep their 6-layer numbering because
                that's where the hierarchy carries real meaning. */}
            <h2 className="dq-h2">Operator landscape</h2>
            <div className="dq-section-rule" />
            <p className="mt-4 max-w-[720px] text-[15px] leading-[1.55] text-muted-foreground">
              {buildLandscapeIntro({
                marketCity: market.city,
                marketMedianDomT12: market.medianDomT12,
                quadrant7CellSummary: market.quadrant7CellSummary ?? {},
              })}
            </p>
          </header>
          <QuadrantSummaryCard
            summary={market.quadrant7CellSummary ?? {}}
            marketHref={marketHref}
          />
        </div>
      </section>

      {/* Ranked operators band — white */}
      <section className="border-b border-grid bg-white">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-14">
          <header className="mb-7">
            <p className="dq-eyebrow">Section 02</p>
            <h2 className="dq-h2 mt-1.5">Ranked operators</h2>
            <div className="dq-section-rule" />
          </header>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
            <FilterChips
              stateSlug={stateSlug}
              citySlug={citySlug}
              marketId={market.id}
              active={activeSegment}
              countsBySegment={countsBySegment}
              submarketSlug={submarket?.slug ?? null}
            />
            <div className="inline-flex h-8 items-center gap-2 rounded-full border border-grid bg-white px-3.5 text-[13px] text-muted-foreground">
              Sorted by: <span className="font-medium text-navy">Within-quadrant rank</span>
              <span className="text-muted-2">↓</span>
            </div>
          </div>

          {/* Submarket reinforcement strip — visible only when ?submarket=
              produced a valid match. The hero now carries the dominant
              filter framing (H1, subtitle, Market Snapshot, intro all swap
              to the submarket); this strip is a thin breadcrumb-style
              reinforcement above the ranked list with the "Clear filter"
              affordance close to where the user is looking. The clear link
              preserves the active segment (drops only the submarket query)
              so e.g. clearing from "Multifamily Institutional in Mesa"
              lands on "Multifamily Institutional in Phoenix" rather than
              wiping the segment filter too. */}
          {submarket && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">
                Submarket filter
              </span>
              <span className="text-muted-2">·</span>
              <span className="font-medium text-navy">
                {submarket.displayName}
              </span>
              <Link
                href={activeSegment ? `${marketHref}/${activeSegment}` : marketHref}
                className="ml-2 inline-flex items-center gap-1 font-medium text-teal hover:text-teal-700"
              >
                <span aria-hidden>×</span> Clear
              </Link>
            </div>
          )}

          <p className="mb-7 text-[12.5px] italic text-muted-foreground">
            Showing{" "}
            <span className="dq-mono not-italic font-medium text-navy/85">
              {filteredPms.length}
            </span>{" "}
            of{" "}
            <span className="dq-mono not-italic font-medium text-navy/85">
              {rankedPoolSize}
            </span>{" "}
            ranked operators
            {activeSegment ? ` in ${segmentLabel(activeSegment)}` : ""}
            {submarket ? ` with footprint in ${submarket.displayName}` : ""}.
            Operators below the data sufficiency threshold are excluded from
            this view.{" "}
            <Link
              href="/methodology"
              className="text-teal not-italic hover:text-teal-700"
            >
              See Methodology →
            </Link>
          </p>

          {filteredPms.length === 0 ? (
            <div className="rounded-lg border border-dashed border-grid bg-[#FAFAF8] p-10 text-center">
              <p className="text-sm font-medium text-navy">
                {submarket
                  ? `No operators observed in ${submarket.displayName}.`
                  : "No operators in this segment yet."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {submarket ? (
                  <>
                    The submarket filter matched zero operators in {market.city}.{" "}
                    <Link
                      href={marketHref}
                      className="text-teal hover:text-teal-700"
                    >
                      Clear the filter
                    </Link>{" "}
                    to view all operators.
                  </>
                ) : (
                  <>
                    Try another filter or{" "}
                    <Link href={marketHref} className="text-teal hover:text-teal-700">
                      view all operators
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {filteredPms.map((pm) => {
                // Resolve the operator's share-of-portfolio in the active
                // submarket from the index-aligned topCitySlugs / topCityPcts
                // arrays populated by toPmListItem. The PMListItem stays
                // unaware of the lookup mechanics — it just receives a
                // pre-resolved share or null (silent fallback) when the
                // submarket isn't found in this PM's topCities entries.
                let pmSubmarket: {
                  displayName: string;
                  share: number | null;
                } | null = null;
                if (submarket) {
                  const idx = (pm.topCitySlugs ?? []).indexOf(submarket.slug);
                  const share =
                    idx >= 0 ? pm.topCityPcts?.[idx] ?? null : null;
                  pmSubmarket = {
                    displayName: submarket.displayName,
                    share: share ?? null,
                  };
                }
                return (
                  <PMListItem
                    key={pm.slug}
                    pm={pm}
                    stateSlug={stateSlug}
                    citySlug={citySlug}
                    submarket={pmSubmarket}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Coverage map band — warm offwhite */}
      <section className="border-b border-grid bg-[#FAFAF8]">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-14">
          <MarketMap view={view} />
        </div>
      </section>

      {/* Lead-matching CTA strip */}
      <MarketCtaStrip marketName={market.city} />

      {/* Methodology footer (in-page, above SiteFooter) */}
      <MethodologyFooter version={methodologyVersion} dataAsOf={dataAsOf} />
    </>
  );
}
