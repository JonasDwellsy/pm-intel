import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const pms = await prisma.pM.findMany({
    select: {
      slug: true,
      name: true,
      quadrant: true,
      rankOverall: true,
      rankOverallTotal: true,
      market: { select: { city: true, state: true, fullName: true } },
    },
    orderBy: { rankOverall: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">
          Property Manager Intelligence
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
          Independent scorecards on how property managers actually perform —
          time on market, rent trajectory, listing quality, tenancy retention.
          Built from real Dwellsy listing data.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Currently covered
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {pms.map((pm) => {
            const stateSlug = pm.market.state.toLowerCase();
            const citySlug = pm.market.city.toLowerCase().replace(/\s+/g, "-");
            return (
              <li key={pm.slug} className="flex items-center justify-between p-4">
                <div>
                  <Link
                    href={`/property-managers/${stateSlug}/${citySlug}/${pm.slug}`}
                    className="text-base font-medium hover:underline"
                  >
                    {pm.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {pm.market.fullName} · {pm.quadrant}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  Rank #{pm.rankOverall} of {pm.rankOverallTotal}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
