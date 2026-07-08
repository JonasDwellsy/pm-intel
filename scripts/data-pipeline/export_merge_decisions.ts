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
interface SeedPm { slug: string; name: string; marketId: string; parentCompanyId?: number | string | null; }
interface OutDecision { marketId: string; survivorKey: string; canonicalName: string;
  survivorSlug: string; memberKeys: string[]; }
interface FragmentRow { marketId: string; slug: string; name?: string; }

// Reconstruct an operator's within-market grouping key EXACTLY as the Python
// pipeline's within_market_key does: a parent-linked operator is keyed by its
// parent id (raw string), a no-parent operator by `name:<namekey>`. The seed's
// parentCompanyId equals that raw parent id for grouped operators, so this keeps
// the exported memberKeys aligned with the keys the pipeline will actually see —
// which is what lets curated merges touch parent-keyed operators (58% of them)
// and not just no-parent name fragments.
export function keyForPm(p: SeedPm): string {
  return p.parentCompanyId != null && String(p.parentCompanyId).trim() !== ""
    ? String(p.parentCompanyId).trim()
    : `name:${nameKey(p.name)}`;
}

// A sub-eligible fragment's slug is literally `frag-<within_market_key>` (see
// pipeline.py merge_fragments emission), so the grouping key is the suffix.
// Typed as `{slug}` (not the full FragmentRow) so it also accepts the bare
// slug-only fixtures the unit tests pass in.
export function keyForFragment(f: { slug: string }): string {
  return f.slug.replace(/^frag-/, "");
}

export function resolveDecisions(rows: DbDecision[], seedPms: SeedPm[], fragments: FragmentRow[] = []) {
  const keyBySlug = new Map<string, string>(); // `${market}::${slug}` -> parent-id | `name:<k>`
  for (const p of seedPms) keyBySlug.set(`${p.marketId}::${p.slug}`, keyForPm(p));
  for (const f of fragments) keyBySlug.set(`${f.marketId}::${f.slug}`, keyForFragment(f));
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
  const fragmentsPath = path.join(__dirname, "../../src/data/merge_fragments.json");
  const fragments = fs.existsSync(fragmentsPath)
    ? (JSON.parse(fs.readFileSync(fragmentsPath, "utf8")).fragments ?? [])
    : [];
  const { decisions, skipped } = resolveDecisions(rows as any, seed.pms, fragments);
  for (const s of skipped) console.warn(`[export] SKIPPED ${s.marketId}: ${s.reason}`);
  const out = { generatedAt: new Date().toISOString(), decisions };
  fs.writeFileSync(path.join(__dirname, "merge_decisions.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`[export] wrote ${decisions.length} merge decision(s), skipped ${skipped.length}`);
  await prisma.$disconnect();
}
// Only run main() when invoked directly (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith("export_merge_decisions.ts")) main();
