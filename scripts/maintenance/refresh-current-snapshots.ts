// One-off maintenance: delete the snapshot rows for the CURRENT data cutoff so
// a methodology reseed rewrites them, instead of silently skipping them.
//
// WHY THIS EXISTS. prisma/seed.ts writes snapshots with
// `createMany({ skipDuplicates: true })` against `@@unique([pmSlug,
// snapshotDate])`, and stamps every row with `snapshotDate = dataAsOf`. A
// METHODOLOGY release re-runs the pipeline over the SAME data, so `dataAsOf`
// does not move — every row for that date already exists and is skipped.
//
// The result is a silent split: the `PM` table gets the new stars while
// `OperatorSnapshot` keeps the old ones. Anything reading snapshots rather than
// `PM` — the watch-list changes page, market-brief change blocks — then shows
// stale stars until the next real data refresh, a month later.
//
// Deleting the current-cutoff rows first lets the seed write them fresh.
//
// SCOPE. Only rows at the seed's own `dataAsOf` are touched. Every earlier
// snapshot is change-tracking history and is left alone — deleting those would
// destroy the baselines every future digest and change block diffs against.
// The target date is READ FROM THE SEED rather than passed in, so this cannot
// be pointed at the wrong date by mistake.
//
// ORDER MATTERS — run this BEFORE the seed:
//
//   1. APPLY=1 npx tsx scripts/maintenance/refresh-current-snapshots.ts
//   2. FORCE_SEED=true npm run db:seed:production
//
// Running it AFTER the seed leaves the current cutoff with no snapshot rows at
// all until the next seed. If that happens, just re-run the seed.
//
// Run:  npx tsx scripts/maintenance/refresh-current-snapshots.ts          (dry run)
//       APPLY=1 npx tsx scripts/maintenance/refresh-current-snapshots.ts  (deletes)

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? "null";

(async () => {
  const seedPath = path.join(process.cwd(), "src/data/scorecard_data.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
    dataAsOf: string;
    methodologyVersion: string;
    pms: unknown[];
  };
  const target = new Date(`${seed.dataAsOf}T00:00:00.000Z`);
  console.log(`Seed: dataAsOf=${seed.dataAsOf} methodologyVersion=${seed.methodologyVersion} pms=${seed.pms.length}`);
  console.log(`Target snapshotDate: ${iso(target)}\n`);

  const rows: Array<{ d: string; n: bigint; versions: string }> =
    await prisma.$queryRawUnsafe(`
      SELECT to_char("snapshotDate",'YYYY-MM-DD') AS d,
             COUNT(*) AS n,
             string_agg(DISTINCT "methodologyVersion", ', ') AS versions
        FROM "OperatorSnapshot"
       GROUP BY 1 ORDER BY 1 DESC LIMIT 8`);

  console.log("Snapshots currently in the database:");
  for (const r of rows) {
    const mark = r.d === seed.dataAsOf ? "  <- TARGET" : "     (history — untouched)";
    console.log(`  ${r.d}  ${String(Number(r.n)).padStart(5)} rows  [${r.versions}]${mark}`);
  }

  const targetRow = rows.find((r) => r.d === seed.dataAsOf);
  if (!targetRow) {
    console.log(`\nNo rows at ${iso(target)}. Nothing to delete — the seed will write them fresh.`);
    await prisma.$disconnect();
    return;
  }

  // Idempotence guard: if these rows already carry the seed's methodology
  // version they were written by this release and deleting them achieves
  // nothing except a needless rewrite.
  if (targetRow.versions === seed.methodologyVersion) {
    console.log(
      `\nRows at ${iso(target)} already carry ${seed.methodologyVersion} — they were written by this release. Nothing to do.`,
    );
    await prisma.$disconnect();
    return;
  }

  console.log(
    `\n${Number(targetRow.n)} row(s) at ${iso(target)} carry [${targetRow.versions}] but the seed is ${seed.methodologyVersion}.`,
  );
  console.log("Deleting them lets the next seed rewrite them with current values.");

  if (process.env.APPLY !== "1") {
    console.log("\nDry run — set APPLY=1 to delete. Remember: delete BEFORE seeding.");
    await prisma.$disconnect();
    return;
  }

  const res = await prisma.operatorSnapshot.deleteMany({ where: { snapshotDate: target } });
  console.log(`\nDELETED ${res.count} row(s) at ${iso(target)}.`);

  const after: Array<{ d: string; n: bigint }> = await prisma.$queryRawUnsafe(`
    SELECT to_char("snapshotDate",'YYYY-MM-DD') AS d, COUNT(*) AS n
      FROM "OperatorSnapshot" GROUP BY 1 ORDER BY 1 DESC LIMIT 8`);
  console.log("Snapshots remaining (history must be intact):");
  for (const r of after) console.log(`  ${r.d}  ${String(Number(r.n)).padStart(5)} rows`);
  console.log("\nNOW RUN:  FORCE_SEED=true npm run db:seed:production");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("ERR:", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
