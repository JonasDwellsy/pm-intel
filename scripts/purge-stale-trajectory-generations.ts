// Maintenance: purge OperatorSnapshot rows from stale methodology generations,
// leaving only the CURRENT generation family. Pairs with the trajectory
// re-backfill (scripts/backfill-trajectory.ts), which then repopulates history
// tagged "<gen>-recon". See the operator-trajectory methodology-mix fix
// (#264/#265): incompatible portfolio-estimator scales that mix into
// single-market Momentum + change digests otherwise render a methodology
// recalibration as a fake portfolio cliff (e.g. 1,412 → 446).
//
// The current generation is auto-detected as the generation of the most-recent
// snapshot (same rule as keepCurrentGenerationSnapshots in the aggregate guard),
// so this stays correct across future methodology bumps without editing a
// hardcoded version. Both the live tag and its "-recon" backfill sibling are one
// generation and are kept together — so re-running AFTER a backfill is a no-op,
// not a wipe of the reconstructed history. Override detection with --keep <gen>.
//
// Usage (against the shared Neon — DATABASE_URL from .env):
//   npx tsx scripts/purge-stale-trajectory-generations.ts             # dry-run
//   npx tsx scripts/purge-stale-trajectory-generations.ts --apply     # delete
//   npx tsx scripts/purge-stale-trajectory-generations.ts --keep v0.8 # pin gen

import { PrismaClient } from "@prisma/client";
import { snapshotGeneration } from "@/lib/operators/trajectory";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const keepOverride = argValue("--keep");
  const prisma = new PrismaClient();
  try {
    // Determine the generation to keep: the override, else the generation of
    // the most-recent snapshot.
    let gen = keepOverride ? snapshotGeneration(keepOverride) : null;
    if (!gen) {
      const latest = await prisma.operatorSnapshot.findFirst({
        orderBy: { snapshotDate: "desc" },
        select: { methodologyVersion: true, snapshotDate: true },
      });
      if (!latest) {
        console.log("No OperatorSnapshot rows — nothing to purge.");
        return;
      }
      gen = snapshotGeneration(latest.methodologyVersion);
      console.log(
        `Current generation auto-detected from latest snapshot (${latest.snapshotDate
          .toISOString()
          .slice(0, 10)}): "${gen}"`
      );
    } else {
      console.log(`Current generation pinned via --keep: "${gen}"`);
    }
    const keepSet = [gen, `${gen}-recon`];

    const before = await prisma.operatorSnapshot.groupBy({
      by: ["methodologyVersion"],
      _count: { _all: true },
    });
    const total = before.reduce((s, r) => s + r._count._all, 0);
    console.log(`Total rows: ${total}  (keeping generation family: ${keepSet.join(", ")})`);
    for (const r of before.sort((a, b) => (a.methodologyVersion < b.methodologyVersion ? -1 : 1))) {
      const mark = snapshotGeneration(r.methodologyVersion) === gen ? "KEEP" : "DELETE";
      console.log(`  ${r.methodologyVersion.padEnd(16)} ${String(r._count._all).padStart(7)}  ${mark}`);
    }
    const toDelete = before
      .filter((r) => snapshotGeneration(r.methodologyVersion) !== gen)
      .reduce((s, r) => s + r._count._all, 0);

    // Fail-closed guards: never let a detection slip wipe the whole table.
    if (toDelete === 0) {
      console.log("\nAll rows are already the current generation — nothing to delete.");
      return;
    }
    if (toDelete === total) {
      console.error(
        `\nABORT: this would delete ALL ${total} rows — no row matches the keep generation "${gen}". ` +
          `The generation was likely mis-detected. Re-check, or pass the correct --keep <gen>.`
      );
      process.exit(1);
    }

    if (!apply) {
      console.log(
        `\nDRY-RUN — would delete ${toDelete} rows (methodologyVersion generation != "${gen}"). Re-run with --apply.`
      );
      return;
    }
    const del = await prisma.operatorSnapshot.deleteMany({
      where: { methodologyVersion: { notIn: keepSet } },
    });
    console.log(`\nDELETED ${del.count} rows.`);
    const after = await prisma.operatorSnapshot.count();
    console.log(`Remaining rows: ${after} (all in generation "${gen}").`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
