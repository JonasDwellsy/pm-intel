// Calibration export: dumps every operator-reported unit count alongside the
// figures we currently hold, so the size-estimator recalibration can run
// offline against the pipeline data.
//
//   npx tsx scripts/data-pipeline/export_reported_sizes.ts [--out <path>]
//
// Default output: scripts/data-pipeline/reported_sizes.csv (gitignored — it
// carries who-said-what from sales conversations, which doesn't belong in the
// repo). CSV rather than JSON because the consumer is a calibration
// spreadsheet, not the app: NOTHING in the running product reads this file.
//
// Why this exists: calibration against the first three counts (Fischer 1,400 vs
// 790 estimated; Income Property Specialists 3,000 vs 803) showed our estimate
// runs 2-4x low for apartment-heavy operators, and that even the best signal we
// hold is ~2x low on both — the residual is coverage, units that never list
// with Dwellsy. No multiplier recovers those, so the only way to know how far
// off we are is to keep collecting these and check.
//
// Mirrors export_name_corrections.ts: ambient DATABASE_URL via the shared
// prisma singleton, run directly with DB env set.

import fs from "node:fs";
import path from "node:path";

/** RFC-4180 escaping. Source notes are free text straight out of a sales call
 *  — they routinely contain commas and quotes. */
function csvCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const outFlag = process.argv.indexOf("--out");
  const outPath =
    outFlag !== -1 && process.argv[outFlag + 1]
      ? path.resolve(process.argv[outFlag + 1])
      : path.join(__dirname, "reported_sizes.csv");

  const { prisma } = await import("../../src/lib/prisma");
  const { loadReportedSizes } = await import(
    "../../src/lib/operators/reported-size.server"
  );

  const entries = await loadReportedSizes();
  if (entries.length === 0) {
    console.log("No reported sizes recorded yet — nothing to export.");
    await prisma.$disconnect();
    return;
  }

  const header = [
    "target_kind",
    "target_key",
    "operator_name",
    "reported_units",
    "estimated_units",
    "ratio_reported_over_estimated",
    "reported_as_of",
    "source_kind",
    "source_note",
  ];
  const lines = [header.join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.targetKind,
        e.targetKey,
        e.name,
        e.reportedUnits,
        e.estimatedUnits,
        e.ratio === null ? null : e.ratio.toFixed(3),
        e.reportedAsOf.toISOString().slice(0, 10),
        e.sourceKind,
        e.sourceNote,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  const comparable = entries.filter((e) => e.ratio !== null);
  console.log(`✓ ${entries.length} reported size(s) → ${outPath}`);
  if (comparable.length > 0) {
    const ratios = comparable.map((e) => e.ratio as number).sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    console.log(
      `  ${comparable.length} comparable · median reported/estimated = ${median.toFixed(2)}×`
    );
    // The bar for acting on these. Two points, both apartment-heavy, can't
    // justify recalibrating the multipliers for the ~900 SFR-heavy operators
    // we have zero validated ground truth for.
    if (comparable.length < 15) {
      console.log(
        `  (${15 - comparable.length} more before a recalibration is worth running)`
      );
    }
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
