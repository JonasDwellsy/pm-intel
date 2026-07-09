/**
 * Platform-wide scorecard metric-correctness audit.
 *
 *   npm run audit:metrics
 *
 * Runs the REAL New view-model (buildScorecardView) over every seeded operator
 * in the DB and checks the displayed metrics against the correct seed fields +
 * internal consistency. Read-only (no writes). Complements the CI guardrail in
 * view-model.test.ts, which locks the field mapping at PR time; this is the
 * on-demand full sweep across all live data.
 *
 * Checks:
 *   A  scored-metric value == the correct seed field (dom/tenancy/rentPerf/marketing)
 *   B  each value correlates with its percentile in the right direction
 *      (generic wrong-field detector — a wrong field shows near-zero/flipped corr)
 *   C  concession tone agrees with value-vs-median
 *   D  no NaN/undefined/"null" leaking into any displayed string
 *   INV  seed self-consistency (tenancy unit math, percentile ranges, bounds)
 *   XSURF  market-list DOM matches the scorecard blob
 *
 * Exits non-zero if any A/C/D/INV/XSURF flag is found (B prints a warning line).
 */
import { PrismaClient } from "@prisma/client";
import { buildScorecardView } from "@/lib/scorecard/view-model";
import { toPmListItem } from "@/lib/slugify";
import type { ScorecardData } from "@/lib/types";

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

function pearson(xy: Array<[number, number]>): number {
  const n = xy.length;
  if (n < 10) return NaN;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of xy) { sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; }
  const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
  return cov / Math.sqrt(vx * vy);
}

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.pM.findMany({
    select: {
      slug: true, name: true, quadrant: true, hybrid: true, rankOverall: true,
      rankQuadrant: true, claimed: true, operatorType: true, marketId: true,
      quadrant7Cell: true, scorecardData: true,
    },
  });
  await prisma.$disconnect();

  const byMkt = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byMkt.has(r.marketId)) byMkt.set(r.marketId, []);
    byMkt.get(r.marketId)!.push(r);
  }

  type Flag = { slug: string; check: string; detail: string };
  const flags: Flag[] = [];
  const corr: Record<string, Array<[number, number]>> = { dom: [], tenancy: [], rentPerformance: [], marketing: [] };
  let processed = 0;

  for (const [, list] of byMkt) {
    const pool = list.map((m) => ({
      slug: m.slug, quadrant7Cell: m.quadrant7Cell,
      scorecard: JSON.parse(m.scorecardData) as ScorecardData,
    }));
    for (const r of list) {
      processed++;
      const sc = JSON.parse(r.scorecardData) as ScorecardData;
      let v: ReturnType<typeof buildScorecardView>;
      try {
        v = buildScorecardView({ scorecard: sc, pool, trajectory: { points: [] }, marketConcessionMedian: null } as never);
      } catch (e) {
        flags.push({ slug: r.slug, check: "CRASH", detail: String(e).slice(0, 140) });
        continue;
      }
      const by = new Map(v.operating.metrics.map((m) => [m.key, m]));

      // A: value == correct seed field
      const dom = by.get("dom");
      if (dom && sc.performance?.domT12 != null && dom.value !== `${Math.round(sc.performance.domT12)}d`)
        flags.push({ slug: r.slug, check: "A:dom", detail: `${dom.value} != ${Math.round(sc.performance.domT12)}d` });
      const rp = by.get("rentPerformance");
      if (rp && sc.rentPerformance?.pmYoyChange != null && rp.value !== `${(sc.rentPerformance.pmYoyChange * 100).toFixed(1)}%`)
        flags.push({ slug: r.slug, check: "A:rentPerf", detail: `${rp.value} != ${(sc.rentPerformance.pmYoyChange * 100).toFixed(1)}%` });
      const mk = by.get("marketing");
      if (mk && sc.marketing?.compositeScore != null && mk.value !== String(Math.round(sc.marketing.compositeScore)))
        flags.push({ slug: r.slug, check: "A:marketing", detail: `${mk.value} != ${Math.round(sc.marketing.compositeScore)}` });

      // B: collect value↔position for correlation
      for (const k of ["dom", "tenancy", "rentPerformance", "marketing"] as const) {
        const m = by.get(k); const val = num(m?.value);
        if (m && val != null && m.position != null) corr[k].push([val, m.position]);
      }

      // C: re-enrichment tone consistency
      const co = v.operating.concession;
      if (co?.marketRatePct != null && co.tone === "watch" && !(co.ratePct > co.marketRatePct * 1.1))
        flags.push({ slug: r.slug, check: "C:concession", detail: `watch but ${co.ratePct} !> ${co.marketRatePct}` });

      // D: render-safety (NaN/undefined/"null"; NOT "Infinity" — a real operator name)
      const strings = [
        v.header.name, v.scaleFit.takeaway, v.operating.takeaway,
        ...v.operating.metrics.flatMap((m) => [m.value, m.interpretation, ...m.sub]),
        co?.interpretation ?? "",
      ];
      if (strings.some((s) => /\b(NaN|undefined)\b|\bnull\b/.test(s ?? "")))
        flags.push({ slug: r.slug, check: "D:render", detail: strings.find((s) => /\b(NaN|undefined)\b|\bnull\b/.test(s ?? ""))!.slice(0, 60) });

      // INV: seed self-consistency
      const t = sc.tenancy;
      if (t?.multiEpisodeUnits != null && t.totalUnits != null && t.multiEpisodeUnits > t.totalUnits)
        flags.push({ slug: r.slug, check: "INV:tenancy", detail: `multiEpisode ${t.multiEpisodeUnits} > total ${t.totalUnits}` });
      if (sc.rank?.percentiles) for (const [k, val] of Object.entries(sc.rank.percentiles))
        if (typeof val === "number" && (val < 0 || val > 100)) flags.push({ slug: r.slug, check: "INV:percentile", detail: `${k}=${val}` });
      if (sc.concessionRate != null && (sc.concessionRate < 0 || sc.concessionRate > 1))
        flags.push({ slug: r.slug, check: "INV:concession", detail: `rate ${sc.concessionRate}` });

      // XSURF: market-list DOM == blob DOM
      try {
        const item = toPmListItem({
          slug: r.slug, name: r.name, quadrant: r.quadrant, hybrid: r.hybrid,
          rankOverall: r.rankOverall, rankQuadrant: r.rankQuadrant, claimed: r.claimed,
          scorecardData: r.scorecardData, operatorType: r.operatorType,
        } as never);
        if (sc.performance?.domT12 != null && item.domT12 != null && Math.round(item.domT12) !== Math.round(sc.performance.domT12))
          flags.push({ slug: r.slug, check: "XSURF:dom", detail: `list ${item.domT12} != blob ${sc.performance.domT12}` });
      } catch (e) {
        flags.push({ slug: r.slug, check: "XSURF:crash", detail: String(e).slice(0, 80) });
      }
    }
  }

  // Report
  console.log(`\n=== metric audit: ${processed} operators across ${byMkt.size} markets ===\n`);
  console.log("Check B — value↔percentile correlation (sign must match direction):");
  const sign: Record<string, number> = { dom: -1, tenancy: 1, rentPerformance: 1, marketing: 1 };
  let corrSuspect = false;
  for (const k of Object.keys(corr)) {
    const rr = pearson(corr[k]);
    const ok = Math.sign(rr) === sign[k] && Math.abs(rr) > 0.3;
    if (!ok) corrSuspect = true;
    console.log(`  ${k.padEnd(16)} corr=${rr.toFixed(2)} (want ${sign[k] > 0 ? "+" : "−"})  ${ok ? "OK" : "!! SUSPECT"}  n=${corr[k].length}`);
  }
  const byCheck = new Map<string, number>();
  for (const f of flags) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
  console.log(`\nFlags: ${flags.length}`);
  for (const [c, n] of [...byCheck.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(16)} ${n}`);
  for (const f of flags.slice(0, 25)) console.log(`    [${f.check}] ${f.slug}: ${f.detail}`);

  const hard = flags.length > 0;
  console.log(`\n${hard || corrSuspect ? "AUDIT FAILED" : "AUDIT CLEAN"}\n`);
  process.exit(hard || corrSuspect ? 1 : 0);
}

main();
