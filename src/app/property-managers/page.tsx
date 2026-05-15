import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stateCodeToSlug, citySlug } from "@/lib/slugify";
import { fmtDays, fmtInt } from "@/lib/format";

export const metadata: Metadata = {
  title: "All markets — Dwellsy IQ",
  description:
    "Browse property manager scorecards by U.S. metro market, with operator counts and median days on market.",
};

export default async function MarketsIndexPage() {
  const markets = await prisma.market.findMany({
    orderBy: { city: "asc" },
    include: { _count: { select: { pms: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Markets covered</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each market page ranks the operators in that MSA with full scorecard
          access for paid subscribers and free preview for everyone.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {markets.map((m) => {
          const state = stateCodeToSlug(m.state);
          const city = citySlug(m.city);
          return (
            <li
              key={m.id}
              className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-muted/40"
            >
              <Link href={`/property-managers/${state}/${city}`}>
                <div className="text-lg font-medium">{m.fullName}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtInt(m._count.pms)} ranked operators · median DOM{" "}
                  {fmtDays(m.medianDomT12)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
