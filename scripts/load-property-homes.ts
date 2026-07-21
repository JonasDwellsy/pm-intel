// Owner-run loader: read the pipeline's per-home extract (property_homes_*.jsonl)
// and upsert PropertyHome rows into Neon. Mirrors backfill-trajectory.ts —
// ambient DATABASE_URL via the shared prisma singleton, chunked upsert so a
// re-run REFRESHES (idempotent on @@unique([pmSlug, addressId])). Run directly:
//   HOMES_DIR=/path/to/pipeline/output npx tsx scripts/load-property-homes.ts
//   npx tsx scripts/load-property-homes.ts --reset   # clear loaded operators first
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

interface HomeRec {
  pmSlug: string; marketId: string; addressId: string; address: string;
  submarket: string | null; latitude: number | null; longitude: number | null;
  bedrooms: number | null; medianRentT12: number | null; domT12: number | null;
  lastListedDate: string | null; nListings: number; concession: boolean;
}

export function parseHomeRecord(line: string): HomeRec | null {
  const t = line.trim();
  if (!t) return null;
  const o = JSON.parse(t);
  if (!o.pmSlug || !o.addressId) return null;
  return {
    pmSlug: o.pmSlug, marketId: o.marketId ?? "", addressId: o.addressId,
    address: o.address ?? "", submarket: o.submarket ?? null,
    latitude: o.latitude ?? null, longitude: o.longitude ?? null,
    bedrooms: o.bedrooms ?? null, medianRentT12: o.medianRentT12 ?? null,
    domT12: o.domT12 ?? null, lastListedDate: o.lastListedDate ?? null,
    nListings: o.nListings ?? 0, concession: !!o.concession,
  };
}

async function main() {
  const reset = process.argv.includes("--reset");
  const dir = process.env.HOMES_DIR || path.join(process.cwd(), "scripts/data-pipeline");
  const files = fs.readdirSync(dir).filter((f) => /^property_homes.*\.jsonl$/.test(f));
  const recs: HomeRec[] = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      const r = parseHomeRecord(line);
      if (r) recs.push(r);
    }
  }
  console.log(`files=${files.length} homes=${recs.length}`);
  if (reset) {
    const slugs = [...new Set(recs.map((r) => r.pmSlug))];
    const del = await prisma.propertyHome.deleteMany({ where: { pmSlug: { in: slugs } } });
    console.log(`reset: deleted ${del.count} rows for ${slugs.length} operators`);
  }
  const CHUNK = 20;
  for (let i = 0; i < recs.length; i += CHUNK) {
    await Promise.all(recs.slice(i, i + CHUNK).map((r) => {
      const data = { ...r, lastListedDate: r.lastListedDate ? new Date(r.lastListedDate) : null };
      const { pmSlug, addressId, ...rest } = data;
      return prisma.propertyHome.upsert({
        where: { pmSlug_addressId: { pmSlug, addressId } },
        create: data,
        update: rest,
      });
    }));
    if (i % 2000 === 0) console.log(`  ${i}/${recs.length}`);
  }
  const total = await prisma.propertyHome.count();
  console.log(`DONE. PropertyHome rows: ${total}`);
  await prisma.$disconnect();
}

// Guard so importing this module for the pure-parser unit test never runs
// main() / touches Neon. process.argv[1] is the entry script node executed —
// under direct execution that's this file's own path; under
// `tsx --test load-property-homes.test.ts` it's the TEST file's path instead.
// A plain `.includes("load-property-homes")` check is NOT enough to tell
// those apart (the test file's own path contains that substring too) — this
// uses an exact-suffix match against this file's own name so the test run
// never triggers main().
if (process.argv[1] && process.argv[1].endsWith("load-property-homes.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
