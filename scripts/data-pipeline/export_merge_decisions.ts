// Reads curated OperatorMergeDecision "merge" rows and writes a committed
// merge_decisions.json the Python pipeline applies. Resolves member SLUGS to
// grouping name-keys against the current committed seed. Run before a re-seed.
//   npx tsx scripts/data-pipeline/export_merge_decisions.ts
import fs from "node:fs";
import path from "node:path";

export function nameKey(name: string): string {
  // MUST match Python operator_grouping.name_key: lowercase, alphanumerics only.
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface DbDecision { marketId: string; decision: string; canonicalName: string | null;
  survivorSlug: string | null; memberSlugs: string; }
interface SeedPm { slug: string; name: string; marketId: string; }
interface OutDecision { marketId: string; survivorKey: string; canonicalName: string;
  survivorSlug: string; memberKeys: string[]; }

export function resolveDecisions(rows: DbDecision[], seedPms: SeedPm[]) {
  const keyBySlug = new Map<string, string>(); // `${market}::${slug}` -> `name:<k>`
  for (const p of seedPms) keyBySlug.set(`${p.marketId}::${p.slug}`, `name:${nameKey(p.name)}`);
  const decisions: OutDecision[] = [];
  const skipped: { marketId: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.decision !== "merge") continue;
    const members: string[] = JSON.parse(r.memberSlugs || "[]");
    const memberKeys: string[] = [];
    let unresolved: string | null = null;
    for (const s of members) {
      const k = keyBySlug.get(`${r.marketId}::${s}`);
      if (!k) { unresolved = s; break; }
      if (!memberKeys.includes(k)) memberKeys.push(k);
    }
    const survivorKey = r.survivorSlug ? keyBySlug.get(`${r.marketId}::${r.survivorSlug}`) : undefined;
    if (unresolved || !survivorKey || !r.canonicalName || memberKeys.length < 2) {
      skipped.push({ marketId: r.marketId, reason: unresolved ? `unresolvable slug ${unresolved}` : "incomplete/degenerate" });
      continue;
    }
    decisions.push({ marketId: r.marketId, survivorKey, canonicalName: r.canonicalName,
      survivorSlug: r.survivorSlug!, memberKeys: memberKeys.sort() });
  }
  decisions.sort((a, b) => (a.marketId + a.survivorKey).localeCompare(b.marketId + b.survivorKey));
  return { decisions, skipped };
}

async function main() {
  const { prisma } = await import("../../src/lib/prisma");
  const rows = await prisma.operatorMergeDecision.findMany({ where: { decision: "merge" } });
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data/scorecard_data.json"), "utf8"));
  const { decisions, skipped } = resolveDecisions(rows as any, seed.pms);
  for (const s of skipped) console.warn(`[export] SKIPPED ${s.marketId}: ${s.reason}`);
  const out = { generatedAt: new Date().toISOString(), decisions };
  fs.writeFileSync(path.join(__dirname, "merge_decisions.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`[export] wrote ${decisions.length} merge decision(s), skipped ${skipped.length}`);
  await prisma.$disconnect();
}
// Only run main() when invoked directly (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith("export_merge_decisions.ts")) main();
