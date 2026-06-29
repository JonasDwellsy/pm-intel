import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stateCodeToSlug, citySlug } from "@/lib/slugify";
import { fmtDays, fmtInt } from "@/lib/format";
import { MarketsCoverageMap } from "@/components/markets/MarketsCoverageMap";
import { buildCoverageRequestMailto } from "@/lib/markets-coverage";
import { resolveViewerEntitlementForPublicSurface } from "@/lib/auth/market-entitlements.server";
import { countAsWord } from "@/lib/format-count";
import marketsSummary from "@/data/markets-summary.json";

// v0.6.4 Patch 4 — derive the market count from the seed at build time
// so the metadata description doesn't go stale.
//
// v0.6.4 Patch 8 — import the slim markets-summary.json (~0.3MB),
// NOT the full scorecard_data.json (~24MB). A default JSON import
// bundles the ENTIRE module into this route's serverless function —
// webpack does not property-level tree-shake JSON — so importing the
// full seed just to read markets.length was dragging 24MB of `pms`
// data into this public marketing page's bundle. The sidecar carries
// only the markets array; merge.py regenerates it alongside the seed.
const LIVE_MARKET_COUNT = (marketsSummary as { markets: unknown[] }).markets.length;

export const metadata: Metadata = {
  title: "All markets — Dwellsy IQ",
  description: `Live coverage in ${LIVE_MARKET_COUNT} US MSAs with 200+ markets available upon request. Browse property manager scorecards by metro market.`,
};

// v0.12 — page now leads with the coverage map. The cards grid is
// kept verbatim as the "Currently live" section so users who came
// here for a specific market still get straight to it without
// scrolling past a hero. Mobile hides the map (the dots are too
// tight to interact with at phone widths); the cards grid +
// footer CTA cover the same surface area.

export default async function MarketsIndexPage() {
  const allMarkets = await prisma.market.findMany({
    orderBy: { city: "asc" },
    include: { _count: { select: { pms: true } } },
  });

  // v0.22 — entitlement-aware. Anonymous visitors see all markets live
  // (public marketing/SEO). A signed-in, market-scoped org sees only its
  // entitled markets as live in both the map (rest greyed "available to
  // add") and the "Currently live" card list.
  const entitlement = await resolveViewerEntitlementForPublicSurface();
  const isScoped = entitlement !== undefined && entitlement !== "all";
  const entitledMapProp: "all" | string[] =
    isScoped ? [...(entitlement as Set<string>)] : "all";
  const markets = isScoped
    ? allMarkets.filter((m) => (entitlement as Set<string>).has(m.id))
    : allMarkets;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-navy">
          Markets covered
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {countAsWord(markets.length)} US MSAs are live today, and we can
          stand up any of the top 200 US markets on request — no waiting.
        </p>
      </header>

      {/* Coverage map — desktop-only (the component hides itself
          below the md breakpoint). Entitlement-aware: a scoped org sees
          its markets live and the rest greyed "available to add". */}
      <MarketsCoverageMap entitledMarkets={entitledMapProp} />

      <section className="mt-12 md:mt-16">
        <h2 className="dq-eyebrow text-teal">Currently live</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each market page ranks the operators in that MSA with full
          scorecards, peer comparisons, and lending signals.
        </p>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => {
            const state = stateCodeToSlug(m.state);
            const city = citySlug(m.city);
            return (
              <li
                key={m.id}
                className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/40"
              >
                <Link href={`/property-managers/${state}/${city}`}>
                  <div className="text-lg font-medium text-navy">
                    {m.fullName}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtInt(m._count.pms)} ranked operators · median DOM{" "}
                    {fmtDays(m.medianDomT12)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-14 rounded-lg border border-grid bg-surface-soft px-6 py-7">
        <p className="dq-eyebrow text-teal">Roadmap</p>
        <h2 className="mt-2 text-[20px] font-semibold leading-snug text-navy">
          Available in 200+ markets on request.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] text-foreground/75">
          If your market isn&rsquo;t live yet, we can stand up any of the top
          200 US markets on request — no waiting on a roadmap.
        </p>
        <a
          href={buildCoverageRequestMailto()}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-navy px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-navy-700"
        >
          Request coverage →
        </a>
      </section>
    </main>
  );
}
