// Reads the OperatorNameCorrection table and writes a committed
// src/data/name_corrections.json that build-operator-universe.ts overlays onto
// the search index. Mirrors export_merge_decisions.ts: ambient DATABASE_URL via
// the shared prisma singleton, run directly with DB env set. Run this BEFORE
// build-operator-universe.ts when refreshing search after a batch of corrections.
//   npx tsx scripts/data-pipeline/export_name_corrections.ts
import fs from "node:fs";
import path from "node:path";

async function main() {
  const { prisma } = await import("../../src/lib/prisma");
  const rows = await prisma.operatorNameCorrection.findMany({
    select: {
      targetKind: true,
      targetKey: true,
      correctedName: true,
      originalName: true,
    },
  });
  const corrections = rows
    .map((r) => ({
      targetKind: r.targetKind,
      targetKey: r.targetKey,
      correctedName: r.correctedName,
      originalName: r.originalName,
    }))
    .sort((a, b) =>
      (a.targetKind + a.targetKey).localeCompare(b.targetKind + b.targetKey)
    );
  const out = { generatedAt: new Date().toISOString(), corrections };
  const outPath = path.join(__dirname, "../../src/data/name_corrections.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(
    `[export] wrote ${corrections.length} name correction(s) → ${outPath}`
  );
  await prisma.$disconnect();
}
// Only run main() when invoked directly (not when imported).
if (process.argv[1] && process.argv[1].endsWith("export_name_corrections.ts"))
  main();
