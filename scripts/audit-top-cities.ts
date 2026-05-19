// One-shot audit script — examines geographicCoverage.topCities across every
// PM in src/data/scorecard_data.json to flag normalization issues before we
// wire up submarket filtering.
//
// Run: npx tsx scripts/audit-top-cities.ts

import fs from "node:fs";
import path from "node:path";

interface TopCity {
  name: string;
  pct: number;
}
interface PMRecord {
  slug?: string;
  name?: string;
  marketId?: string;
  geographicCoverage?: { topCities?: TopCity[] };
}

const DATA_PATH = path.resolve(__dirname, "../src/data/scorecard_data.json");
const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
// Structure: { pms: [...], markets: [...] }
const records: PMRecord[] = Array.isArray(raw.pms)
  ? raw.pms
  : Object.values(raw.pms ?? {});
const marketLookup = new Map<string, string>();
for (const m of Array.isArray(raw.markets) ? raw.markets : []) {
  marketLookup.set(m.id, m.fullName ?? m.name ?? m.id);
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface MarketAgg {
  marketId: string;
  marketName: string;
  uniqueRaw: Set<string>;
  uniqueNormalized: Set<string>;
  cityFreq: Map<string, number>;
  citySlugFreq: Map<string, { displayName: string; count: number }>;
  cityRawForms: Map<string, Set<string>>;
}

const markets = new Map<string, MarketAgg>();
let totalPMs = 0;
let pmsWithCities = 0;
const issues: string[] = [];

for (const rec of records) {
  totalPMs++;
  const topCities = rec.geographicCoverage?.topCities ?? [];
  if (topCities.length === 0) continue;
  pmsWithCities++;

  const marketId = rec.marketId ?? "UNKNOWN";
  const marketName = marketLookup.get(marketId) ?? marketId;
  let agg = markets.get(marketId);
  if (!agg) {
    agg = {
      marketId,
      marketName,
      uniqueRaw: new Set(),
      uniqueNormalized: new Set(),
      cityFreq: new Map(),
      citySlugFreq: new Map(),
      cityRawForms: new Map(),
    };
    markets.set(marketId, agg);
  }
  for (const c of topCities) {
    const raw = c.name;
    const norm = normalize(raw);
    const slug = slugify(raw);
    agg.uniqueRaw.add(raw);
    agg.uniqueNormalized.add(norm);
    agg.cityFreq.set(norm, (agg.cityFreq.get(norm) ?? 0) + 1);
    const slugEntry = agg.citySlugFreq.get(slug);
    if (slugEntry) {
      slugEntry.count++;
    } else {
      agg.citySlugFreq.set(slug, { displayName: raw, count: 1 });
    }
    const forms = agg.cityRawForms.get(norm) ?? new Set();
    forms.add(raw);
    agg.cityRawForms.set(norm, forms);

    // Issue checks per-row
    if (raw !== raw.trim()) {
      issues.push(
        `Trailing/leading whitespace: "${raw}" (market ${marketId}, PM ${rec.slug})`
      );
    }
  }
}

console.log("\n========== TOP CITY DATA AUDIT ==========\n");
console.log(`Total PM records: ${totalPMs}`);
console.log(`PMs with topCities populated: ${pmsWithCities}`);
console.log(`Markets observed: ${markets.size}\n`);

const summaryRows: Array<{
  marketId: string;
  uniqueCities: number;
  uniqueSlugs: number;
  topCity: string;
  topCityCount: number;
  singletonCities: number;
}> = [];

for (const agg of markets.values()) {
  const sortedByFreq = [...agg.cityFreq.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const singletons = sortedByFreq.filter(([, n]) => n === 1).length;
  summaryRows.push({
    marketId: agg.marketId,
    uniqueCities: agg.uniqueNormalized.size,
    uniqueSlugs: agg.citySlugFreq.size,
    topCity: sortedByFreq[0]?.[0] ?? "—",
    topCityCount: sortedByFreq[0]?.[1] ?? 0,
    singletonCities: singletons,
  });

  // Multi-form check — same normalized name appearing with multiple raw spellings
  for (const [norm, forms] of agg.cityRawForms.entries()) {
    if (forms.size > 1) {
      issues.push(
        `Multi-form city in ${agg.marketId}: normalized="${norm}" forms=${JSON.stringify([...forms])}`
      );
    }
  }
}

console.log("Per-market summary:");
console.log(
  "marketId | uniqueCities | uniqueSlugs | topCity (count) | singletonCities"
);
console.log("-".repeat(90));
for (const row of summaryRows.sort((a, b) =>
  a.marketId.localeCompare(b.marketId)
)) {
  console.log(
    `${row.marketId.padEnd(20)} | ${String(row.uniqueCities).padStart(12)} | ${String(row.uniqueSlugs).padStart(11)} | ${(row.topCity + ` (${row.topCityCount})`).padEnd(30)} | ${row.singletonCities}`
  );
}

console.log("\n--- Top 5 cities per market by operator frequency ---\n");
for (const agg of markets.values()) {
  const sortedByFreq = [...agg.cityFreq.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  console.log(`${agg.marketName} (${agg.marketId}):`);
  for (const [norm, count] of sortedByFreq.slice(0, 5)) {
    const forms = [...(agg.cityRawForms.get(norm) ?? [])];
    console.log(`  ${forms.join(" / ")} — ${count} operators`);
  }
  console.log("");
}

console.log("\n--- Normalization issues ---\n");
if (issues.length === 0) {
  console.log("✓ No normalization issues detected");
} else {
  for (const issue of issues) console.log(`  ! ${issue}`);
}

console.log("\n--- Cross-market name collisions ---\n");
// Same normalized city name appearing across multiple markets — informational
// (e.g., Bay City TX vs Bay City MI) so the route always carries marketId.
const slugMarketMap = new Map<string, Set<string>>();
for (const agg of markets.values()) {
  for (const [slug] of agg.citySlugFreq.entries()) {
    const set = slugMarketMap.get(slug) ?? new Set();
    set.add(agg.marketId);
    slugMarketMap.set(slug, set);
  }
}
const collisions = [...slugMarketMap.entries()].filter(([, mkts]) => mkts.size > 1);
if (collisions.length === 0) {
  console.log("✓ No cross-market slug collisions");
} else {
  for (const [slug, mkts] of collisions) {
    console.log(`  ${slug} → appears in markets: ${[...mkts].join(", ")}`);
  }
}

console.log("\n========================================\n");
