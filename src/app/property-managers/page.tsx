import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stateCodeToSlug, citySlug } from "@/lib/slugify";
import { fmtDays, fmtInt } from "@/lib/format";
import { MarketsCoverageMap } from "@/components/markets/MarketsCoverageMap";
import { buildCoverageRequestMailto } from "@/lib/markets-coverage";

export const metadata: Metadata = {
  title: "All markets — Dwellsy IQ",
  description:
    "Live coverage in 10 US MSAs with 20+ top markets available upon request. Browse property manager scorecards by metro market.",
};

// v0.12 — page now leads with the coverage map. The cards grid is
// kept verbatim as the "Currently live" section so users who came
// here for a specific market still get straight to it without
// scrolling past a hero. Mobile hides the map (the dots are too
// tight to interact with at phone widths); the cards grid +
// footer CTA cover the same surface area.

export default async function MarketsIndexPage() {
  const markets = await prisma.market.findMany({
    orderBy: { city: "asc" },
    include: { _count: { select: { pms: true } } },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-navy">
          Markets covered
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Ten US MSAs are live today, with 20+ top-twenty markets available
          upon request. National coverage is rolling out through 2026 —
          prioritized by acquirer demand.
        </p>
      </header>

      {/* Coverage map — desktop-only (the component hides itself
          below the md breakpoint). */}
      <MarketsCoverageMap />

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
          Available in 20+ top US markets on request.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] text-foreground/75">
          Dwellsy IQ is rolling out national coverage. If your market isn&rsquo;t
          live yet, we can prioritize based on demand from acquirers and
          institutional users.
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
