// DEV-ONLY, UNCOMMITTED preview index — lists real operators (grouped by
// market) so we can click into the redesigned scorecard on real data before
// merging PR #140. 404s in prod. Companion to ./[slug]/page.tsx.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PER_MARKET = 10;

export default async function DevScorecardIndex() {
  if (process.env.NODE_ENV === "production") notFound();

  const pms = await prisma.pM.findMany({
    select: {
      slug: true,
      name: true,
      market: { select: { state: true, city: true } },
    },
  });

  // Group by "City, ST"; cap per market so the list stays browsable.
  const byMarket = new Map<string, Array<{ slug: string; name: string }>>();
  for (const pm of pms) {
    const label = pm.market ? `${pm.market.city}, ${pm.market.state}` : "—";
    const arr = byMarket.get(label) ?? [];
    if (arr.length < PER_MARKET) arr.push({ slug: pm.slug, name: pm.name });
    byMarket.set(label, arr);
  }
  const markets = [...byMarket.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 80px" }}>
      <div
        style={{
          background: "#fff7d6",
          border: "1px solid #e6d98a",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "#6b5e17",
          marginBottom: 20,
        }}
      >
        Dev-only preview index — click any operator to see the{" "}
        <strong>redesigned scorecard on real data</strong> (auth bypassed).
        Showing up to {PER_MARKET} operators per market. Total operators:{" "}
        {pms.length}. This route 404s in production.
        <br />
        Prefer the fixture demo?{" "}
        <a href="/dev/scorecard-preview" style={{ textDecoration: "underline" }}>
          /dev/scorecard-preview
        </a>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>
        Redesigned scorecards — real operators
      </h1>
      <p style={{ color: "#5b6577", fontSize: 13, margin: "0 0 24px" }}>
        {markets.length} markets. Depth of the Momentum trends varies by how
        much snapshot history each operator has.
      </p>

      {markets.map(([label, ops]) => (
        <section key={label} style={{ marginBottom: 22 }}>
          <h2
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#8a92a2",
              borderBottom: "1px solid #e3e8ef",
              paddingBottom: 4,
              margin: "0 0 8px",
            }}
          >
            {label} · {ops.length}
          </h2>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "4px 16px",
            }}
          >
            {ops.map((op) => (
              <li key={op.slug}>
                <a
                  href={`/dev/scorecards/${op.slug}`}
                  style={{
                    color: "#155772",
                    textDecoration: "none",
                    fontSize: 14,
                  }}
                >
                  {op.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
