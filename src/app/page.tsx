import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stateCodeToSlug, citySlug } from "@/lib/slugify";

export default async function Home() {
  const [pms, markets] = await Promise.all([
    prisma.pM.findMany({
      select: {
        slug: true,
        name: true,
        quadrant: true,
        rankOverall: true,
        rankOverallTotal: true,
        market: { select: { city: true, state: true, fullName: true } },
      },
      orderBy: { rankOverall: "asc" },
    }),
    prisma.market.count(),
  ]);

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

      <section className="mb-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Browse markets
          </h2>
          <Link
            href="/property-managers"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            All markets ({markets}) →
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Highlighted operators
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {pms.map((pm) => {
            const state = stateCodeToSlug(pm.market.state);
            const city = citySlug(pm.market.city);
            return (
              <li key={pm.slug} className="flex items-center justify-between p-4">
                <div>
                  <Link
                    href={`/property-managers/${state}/${city}/${pm.slug}`}
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
