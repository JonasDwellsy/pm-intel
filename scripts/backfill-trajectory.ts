// v0.22 (3b) — historical operator-trajectory backfill.
//
// Reconstructs per-operator OperatorSnapshot rows for past quarters by
// running the existing pipeline with --as-of set to each quarter-end (the
// whole pipeline is keyed off that date), then computing portfolio + star
// roll-ups via the SAME helpers the live seed uses — so reconstructed
// values match what the live estimator would have produced. Rows are
// tagged methodologyVersion = "v0.6.4-recon" and only written for
// operators that still exist today (so they join the scorecard the
// trajectory UI renders). The 3a UI reads OperatorSnapshot, so this
// deepens it with no UI change.
//
// Usage:
//   npx tsx scripts/backfill-trajectory.ts [--markets=id1,id2] \
//     [--quarters=2024-12-31,2025-12-31] [--dry-run] [--reset]
//
//   --dry-run  compute + summarize, write nothing (validation)
//   --reset    delete prior recon rows before writing (idempotent re-run)

import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { estimatePortfolioSize } from "@/lib/operators/portfolio-estimate";
import {
  extractStarsPerMetric,
  countStarTotals,
  readActiveSubmarkets,
  readPortfolioBand,
} from "@/lib/watch-list/snapshot";
import type { ScorecardData } from "@/lib/types";

const SCRIPT_DIR = path.join(process.cwd(), "scripts/data-pipeline");
const TMP = path.join(process.cwd(), ".trajectory-backfill-tmp");

// Recon rows are tagged "<current methodology>-recon" (e.g. "v0.7-recon"), read
// from the committed seed so a methodology bump doesn't leave recon stranded on
// a stale tag. snapshotGeneration() (trajectory.ts) strips the "-recon" suffix,
// so the trajectory groups this reconstructed history with the live captures of
// the same generation — and the loaders' generation guard never blends it with
// an OLDER estimator's rows. (Previously hardcoded "v0.6.4-recon", which the
// guard then excluded once live captures moved to v0.7 — the bug this fixes.)
const RECON_VERSION = `${
  (
    JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "src/data/scorecard_data.json"),
        "utf8"
      )
    ) as { methodologyVersion: string }
  ).methodologyVersion
}-recon`;

/** Quarter-end dates 2022Q1 → 2026Q2 (inclusive). Floor is 2022Q1: the merged
 *  source data has robust listing volume from 2021, so 2022Q1 is the first
 *  quarter with a FULL 12-month T12 window (earlier quarters reconstruct from a
 *  partial/empty window and are unreliable). Quarterly cadence — T12 windows
 *  make monthly steps redundant. Bump the end bound as new quarters complete. */
function defaultQuarters(): string[] {
  const out: string[] = [];
  for (let y = 2022; y <= 2026; y++) {
    for (const [m, d] of [[3, 31], [6, 30], [9, 30], [12, 31]] as const) {
      const s = `${y}-${String(m).padStart(2, "0")}-${d}`;
      if (s >= "2022-03-31" && s <= "2026-06-30") out.push(s);
    }
  }
  return out;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const reset = process.argv.includes("--reset");
  const cfg = JSON.parse(
    fs.readFileSync(path.join(SCRIPT_DIR, "markets.json"), "utf8")
  ) as { markets: Array<{ id: string; outputSlug: string }> };

  const marketFilter = arg("markets")?.split(",");
  const markets = marketFilter
    ? cfg.markets.filter((m) => marketFilter.includes(m.id))
    : cfg.markets;
  const quarters = arg("quarters")?.split(",") ?? defaultQuarters();

  const prisma = new PrismaClient();
  const todaySlugs = new Set(
    (await prisma.pM.findMany({ select: { slug: true } })).map((p) => p.slug)
  );
  console.log(
    `backfill: ${markets.length} market(s) × ${quarters.length} quarter(s); ` +
      `${todaySlugs.size} current operators; ${dryRun ? "DRY-RUN" : "WRITING"}`
  );

  if (reset && !dryRun) {
    const del = await prisma.operatorSnapshot.deleteMany({
      where: { methodologyVersion: RECON_VERSION },
    });
    console.log(`reset: deleted ${del.count} prior recon rows`);
  }

  fs.mkdirSync(TMP, { recursive: true });
  let grandTotal = 0;

  for (const mkt of markets) {
    let mktRows = 0;
    // dry-run portfolio probe: operator → quarter → point
    const probe = new Map<string, Record<string, number | null>>();
    for (const q of quarters) {
      const outDir = path.join(TMP, mkt.id, q);
      fs.mkdirSync(outDir, { recursive: true });
      try {
        execFileSync(
          "python3",
          ["pipeline.py", "--market", mkt.id, "--as-of", q, "--out-dir", outDir],
          { cwd: SCRIPT_DIR, stdio: "ignore" }
        );
      } catch {
        // A quarter before this market had data can yield an empty cohort;
        // skip rather than abort the whole backfill.
        continue;
      }
      const file = path.join(outDir, `Scorecard_Data_v0.6.4_${mkt.outputSlug}.json`);
      if (!fs.existsSync(file)) continue;
      const pms: Array<Record<string, unknown>> =
        JSON.parse(fs.readFileSync(file, "utf8")).pms ?? [];

      const rows = [];
      let withPortfolio = 0;
      let portfolioSum = 0;
      for (const pm of pms) {
        const slug = pm.slug as string;
        if (!todaySlugs.has(slug)) continue;
        const coverage = (pm.coverage as Record<string, unknown>) ?? {};
        const performance = (pm.performance as Record<string, unknown>) ?? {};
        // Historical snapshots use the default multipliers (the admin-tunable
        // k's apply to the live seed; a re-tune re-aligns on the next backfill).
        const sc = {
          ...pm,
          portfolioEstimate: estimatePortfolioSize(coverage, performance),
        } as unknown as ScorecardData;
        const stars = extractStarsPerMetric(sc);
        const totals = countStarTotals(stars);
        const band = readPortfolioBand(sc);
        const subs = readActiveSubmarkets(
          JSON.stringify(pm.t12ListingsBySubmarket ?? {})
        );
        const t12 =
          typeof coverage.t12Listings === "number"
            ? Math.round(coverage.t12Listings)
            : null;
        if (band.point !== null) {
          withPortfolio++;
          portfolioSum += band.point;
        }
        if (dryRun) {
          const series = probe.get(slug) ?? {};
          series[q] = band.point;
          probe.set(slug, series);
        }
        rows.push({
          pmSlug: slug,
          snapshotDate: new Date(`${q}T00:00:00Z`),
          methodologyVersion: RECON_VERSION,
          starsPerMetric: JSON.stringify(stars),
          starGoldCount: totals.gold,
          starSilverCount: totals.silver,
          estimatedPortfolioPoint: band.point,
          estimatedPortfolioBand: band.band,
          topMSAs: JSON.stringify([mkt.id]),
          topSubmarkets: JSON.stringify(subs),
          concessionRate:
            typeof pm.concessionRate === "number" ? pm.concessionRate : null,
          isEligibleForRanking: true,
          t12ListingsCount: t12,
        });
      }

      if (!dryRun && rows.length > 0) {
        // Upsert (not createMany/skipDuplicates) so a re-run REFRESHES existing
        // recon rows — the whole point of the v0.25 re-run is to add
        // t12ListingsCount to rows written by an earlier backfill. Upsert also
        // makes the script idempotent without --reset, so there's no window
        // where recon history is deleted on the live shared DB. Chunked so we
        // don't exhaust the connection pool on the ~28k-row full run.
        const CHUNK = 20;
        for (let i = 0; i < rows.length; i += CHUNK) {
          await Promise.all(
            rows.slice(i, i + CHUNK).map((row) => {
              const { pmSlug, snapshotDate, ...rest } = row;
              return prisma.operatorSnapshot.upsert({
                where: { pmSlug_snapshotDate: { pmSlug, snapshotDate } },
                create: row,
                update: rest,
              });
            })
          );
        }
        mktRows += rows.length;
      } else {
        mktRows += rows.length;
      }
      if (dryRun) {
        console.log(
          `  ${q}  eligible=${pms.length}  joined=${rows.length}  ` +
            `w/portfolio=${withPortfolio}  Σunits=${portfolioSum.toLocaleString()}`
        );
      }
    }
    console.log(
      `${mkt.id}: ${mktRows} rows${dryRun ? " (dry-run, not written)" : " written"}`
    );

    if (dryRun) {
      // Show one portfolio-rich operator's reconstructed curve.
      const ranked = [...probe.entries()]
        .map(([slug, s]) => [slug, Object.values(s).filter((v) => v !== null).length] as const)
        .sort((a, b) => b[1] - a[1]);
      const sample = ranked.find(([, n]) => n >= 2);
      if (sample) {
        console.log(`  sample portfolio trajectory — ${sample[0]}:`);
        const s = probe.get(sample[0])!;
        for (const q of quarters) {
          if (q in s) console.log(`    ${q}: ${s[q] ?? "—"} units`);
        }
      }
    }
    grandTotal += mktRows;
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(
    `\nDONE: ${grandTotal} reconstructed snapshot rows ${
      dryRun ? "(dry-run, nothing written)" : "written"
    }`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("backfill error:", e);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
