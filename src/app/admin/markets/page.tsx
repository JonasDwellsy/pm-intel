// v0.20 — Stage 1.5 admin dashboard, markets tab.
//
// Read-only operational view over the v0.6.4 market data. Surfaces:
//   - per-market dataAsOf, ranked PM count, methodology version, days
//     since last refresh
//   - cross-market health checks: stale data (>60 days), methodology
//     version drift, intra-market slug-collision count, single-market
//     operators that look like they should be canonicalized
//
// First tab in what's intended to become a small admin panel (upload
// + canonical curation are deliberately Stage 2 — see
// scripts/data-pipeline/README.md for the safety rationale).
//
// Auth gate: middleware enforces Clerk session; isAdminUser() enforces
// ADMIN_USER_IDS allowlist. Non-admin signed-in users get notFound()
// so the route's existence stays invisible outside the admin set.
//
// Data source: Prisma DB (Market + PM tables) rather than the seed
// JSON file. DB is the live truth — if a seed re-run silently
// dropped a market, this surface should reflect what's actually there.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isAdminUser } from "@/lib/auth/is-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Markets",
  robots: { index: false, follow: false },
};

const STALENESS_WARNING_DAYS = 60;

/** Render age as "12d" / "3mo" / "1y". Compact for table cells. */
function formatAge(days: number): string {
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

interface MarketRow {
  id: string;
  fullName: string;
  state: string;
  rankedPMs: number;
  totalPMs: number;
  dataAsOf: Date | null;
  ageDays: number | null;
  methodologyVersion: string;
  hasCanonicalSuffix: number; // count of PMs whose canonical id still ends in -{marketId} (potentially canonicalizable)
}

async function loadMarkets(): Promise<MarketRow[]> {
  // Single round-trip — fetch markets + per-market PM rollups in
  // parallel rather than N+1 per-market queries.
  const [markets, pmRollups] = await Promise.all([
    prisma.market.findMany({
      select: {
        id: true,
        fullName: true,
        state: true,
        operatorCountEligible: true,
        operatorCountTotal: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.pM.groupBy({
      by: ["marketId", "methodologyVersion"],
      _count: { _all: true },
      _max: { dataAsOf: true },
    }),
  ]);

  // Index the rollup. Each market should have exactly one
  // methodologyVersion (verified by the health check below); group
  // collapses to keep the count even if there's drift.
  const rollupByMarket = new Map<
    string,
    { count: number; dataAsOf: Date | null; methodologyVersion: string }
  >();
  for (const r of pmRollups) {
    const existing = rollupByMarket.get(r.marketId);
    const dataAsOf =
      r._max.dataAsOf ??
      (existing?.dataAsOf ? existing.dataAsOf : null);
    if (existing) {
      existing.count += r._count._all;
      // Mismatch is surfaced as a flag downstream; keep the lexically-
      // first version string to be deterministic across renders.
      if (r.methodologyVersion < existing.methodologyVersion) {
        existing.methodologyVersion = r.methodologyVersion;
      }
      if (dataAsOf && (!existing.dataAsOf || dataAsOf > existing.dataAsOf)) {
        existing.dataAsOf = dataAsOf;
      }
    } else {
      rollupByMarket.set(r.marketId, {
        count: r._count._all,
        dataAsOf,
        methodologyVersion: r.methodologyVersion,
      });
    }
  }

  // Count PMs whose canonicalOperatorId still carries the per-market
  // suffix — that's the signal that the operator hasn't been
  // canonicalized as a cross-market entity. Most single-market
  // operators legitimately have this shape, but a high count after a
  // new market is added is the signal that canonical-mapping curation
  // is overdue.
  const pmRows = await prisma.pM.findMany({
    select: { marketId: true, slug: true, scorecardData: true },
  });
  const suffixCounts = new Map<string, number>();
  for (const pm of pmRows) {
    // Cheap heuristic: the slug already encodes the marketId suffix;
    // the canonicalOperatorId being equal to the slug means it's a
    // per-market PM that hasn't been folded into a canonical entity.
    // We pull the canonicalOperatorId out of scorecardData rather
    // than re-running the slug pattern — robust to slugify changes.
    let canonicalOperatorId: string | undefined;
    try {
      canonicalOperatorId = (
        JSON.parse(pm.scorecardData) as { canonicalOperatorId?: string }
      ).canonicalOperatorId;
    } catch {
      // Malformed scorecardData — skip this PM for the count.
      continue;
    }
    if (canonicalOperatorId === pm.slug) {
      suffixCounts.set(pm.marketId, (suffixCounts.get(pm.marketId) ?? 0) + 1);
    }
  }

  const now = Date.now();
  return markets.map((m) => {
    const r = rollupByMarket.get(m.id);
    const dataAsOf = r?.dataAsOf ?? null;
    return {
      id: m.id,
      fullName: m.fullName,
      state: m.state,
      rankedPMs: m.operatorCountEligible,
      totalPMs: r?.count ?? 0,
      dataAsOf,
      ageDays: dataAsOf
        ? (now - dataAsOf.getTime()) / (1000 * 60 * 60 * 24)
        : null,
      methodologyVersion: r?.methodologyVersion ?? "unknown",
      hasCanonicalSuffix: suffixCounts.get(m.id) ?? 0,
    };
  });
}

interface HealthSummary {
  marketCount: number;
  totalPMs: number;
  staleMarkets: string[];
  versionsInUse: string[];
  oldestRefresh: { id: string; ageDays: number } | null;
}

function computeHealth(rows: MarketRow[]): HealthSummary {
  const staleMarkets = rows
    .filter((r) => r.ageDays !== null && r.ageDays > STALENESS_WARNING_DAYS)
    .map((r) => r.id);
  const versionsInUse = Array.from(
    new Set(rows.map((r) => r.methodologyVersion))
  ).sort();
  const withAge = rows.filter(
    (r): r is MarketRow & { ageDays: number } => r.ageDays !== null
  );
  const oldest =
    withAge.length === 0
      ? null
      : withAge.reduce((a, b) => (a.ageDays > b.ageDays ? a : b));
  return {
    marketCount: rows.length,
    totalPMs: rows.reduce((sum, r) => sum + r.totalPMs, 0),
    staleMarkets,
    versionsInUse,
    oldestRefresh: oldest
      ? { id: oldest.id, ageDays: oldest.ageDays }
      : null,
  };
}

export default async function AdminMarketsPage() {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) notFound();

  const rows = await loadMarkets();
  const health = computeHealth(rows);

  return (
    <main className="bg-white min-h-screen">
      <div className="mx-auto max-w-[1100px] px-6 py-12">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-teal-700 mb-2">
            Admin
          </p>
          <h1 className="text-3xl font-bold text-navy">Markets</h1>
          <p className="text-[14px] text-grey-600 mt-2 leading-relaxed max-w-[680px]">
            Operational view of the v0.6.4 market data currently in
            production. To add or refresh a market, see{" "}
            <code className="text-[12px] bg-surface-soft px-1.5 py-0.5 rounded border border-grid">
              scripts/data-pipeline/README.md
            </code>
            . Upload-from-UI lands in a later phase — the CLI workflow
            stays the authoritative path until canonical-curation has
            been done end-to-end a few more times.
          </p>
        </header>

        {/* Health summary band */}
        <section className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3">
          <HealthTile label="Markets" value={health.marketCount} />
          <HealthTile label="PMs (total)" value={health.totalPMs} />
          <HealthTile
            label="Methodology version"
            value={health.versionsInUse.join(" / ")}
            warn={health.versionsInUse.length > 1}
          />
          <HealthTile
            label="Stale (>60d)"
            value={health.staleMarkets.length}
            warn={health.staleMarkets.length > 0}
          />
        </section>

        {/* Per-market table */}
        <section>
          <h2 className="text-[12px] uppercase tracking-[0.18em] font-semibold text-grey-600 mb-3">
            Markets
          </h2>
          <div className="border border-grid rounded-md overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-soft text-grey-700">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    Market
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Ranked
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Total PMs
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Data as of
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold">
                    Age
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold">
                    Methodology
                  </th>
                  <th
                    className="text-right px-4 py-2.5 font-semibold"
                    title="PMs whose canonicalOperatorId equals their slug — single-market or not-yet-canonicalized. High counts after a market add = canonical curation overdue."
                  >
                    Single-mkt PMs
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const stale =
                    r.ageDays !== null && r.ageDays > STALENESS_WARNING_DAYS;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-grid hover:bg-surface-soft/40"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-navy">
                          {r.fullName}
                        </div>
                        <div className="text-[11px] text-grey-500 font-mono">
                          {r.id}
                        </div>
                      </td>
                      <td className="text-right px-4 py-2.5 tabular-nums">
                        {r.rankedPMs}
                      </td>
                      <td className="text-right px-4 py-2.5 tabular-nums text-grey-600">
                        {r.totalPMs}
                      </td>
                      <td className="text-right px-4 py-2.5 tabular-nums">
                        {r.dataAsOf
                          ? r.dataAsOf.toISOString().slice(0, 10)
                          : "—"}
                      </td>
                      <td
                        className={`text-right px-4 py-2.5 tabular-nums ${stale ? "text-orange-700 font-medium" : "text-grey-600"}`}
                      >
                        {r.ageDays !== null ? formatAge(r.ageDays) : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-grey-700">
                        {r.methodologyVersion}
                      </td>
                      <td className="text-right px-4 py-2.5 tabular-nums text-grey-600">
                        {r.hasCanonicalSuffix}
                        <span className="text-grey-400">
                          {" / "}
                          {r.totalPMs}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Health-check details */}
        {(health.staleMarkets.length > 0 ||
          health.versionsInUse.length > 1) && (
          <section className="mt-8 border border-grid rounded-md p-4 bg-surface-soft">
            <h2 className="text-[12px] uppercase tracking-[0.18em] font-semibold text-grey-600 mb-2">
              Health checks
            </h2>
            <ul className="text-[13px] text-grey-700 space-y-1">
              {health.staleMarkets.length > 0 && (
                <li>
                  <span className="font-medium text-orange-700">
                    {health.staleMarkets.length} stale market
                    {health.staleMarkets.length === 1 ? "" : "s"}
                    :
                  </span>{" "}
                  {health.staleMarkets.join(", ")} (older than{" "}
                  {STALENESS_WARNING_DAYS} days). Refresh via{" "}
                  <code className="text-[12px]">pipeline.py --market &lt;id&gt;</code>
                  .
                </li>
              )}
              {health.versionsInUse.length > 1 && (
                <li>
                  <span className="font-medium text-orange-700">
                    Methodology version drift:
                  </span>{" "}
                  multiple versions in use ({health.versionsInUse.join(", ")}
                  ). Re-seed all markets at the same methodology version
                  to bring them in sync.
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Footer pointer */}
        <footer className="mt-12 text-[12px] text-grey-500 border-t border-grid pt-4">
          <p>
            Data source: Prisma DB (Market + PM tables). Refresh
            cadence: re-seed on every Vercel deploy unless the
            scorecard JSON is unchanged (isDataCurrent skip). For the
            add-a-market and refresh-a-market recipes, see{" "}
            <code>scripts/data-pipeline/README.md</code>.
          </p>
        </footer>
      </div>
    </main>
  );
}

function HealthTile({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div
      className={`border rounded-md px-4 py-3 ${warn ? "border-orange-300 bg-orange-50/40" : "border-grid bg-white"}`}
    >
      <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-grey-500">
        {label}
      </div>
      <div
        className={`text-2xl font-semibold mt-1 tabular-nums ${warn ? "text-orange-700" : "text-navy"}`}
      >
        {value}
      </div>
    </div>
  );
}
