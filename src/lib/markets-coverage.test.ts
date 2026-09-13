import test from "node:test";
import assert from "node:assert/strict";

import coverage from "@/data/markets-with-coverage.json";
import summary from "@/data/markets-summary.json";

type CoverageEntry = { slug: string; name: string; shortName: string };
type SeedMarket = { id: string; city: string; state: string };

const entries = (coverage as unknown as { markets: CoverageEntry[] }).markets;
const seeded = (summary as unknown as { markets: SeedMarket[] }).markets;

// getCoverageMarkets() decides live-vs-available by matching a coverage
// entry's `slug` against a SEEDED market id — the stored `status` field is
// advisory and deliberately ignored. So a seeded market whose slug doesn't
// match renders as a grey "available upon request" dot forever, with no
// error anywhere. That is exactly what happened to Atlanta: it shipped as
// market 45 with 196 operators while the map still carried the placeholder
// slug "atlanta-ga" from when it was a prospect, so the dot stayed grey.
test("every seeded market has a coverage entry whose slug matches its id", () => {
  const slugs = new Set(entries.map((e) => e.slug));
  const invisible = seeded.map((m) => m.id).filter((id) => !slugs.has(id));
  assert.deepEqual(
    invisible,
    [],
    `these markets are seeded but would render as grey "available" dots — ` +
      `add a coverage entry whose slug is EXACTLY the market id: ${invisible.join(", ")}`
  );
});

test("coverage slugs are unique", () => {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const e of entries) {
    if (seen.has(e.slug)) dupes.push(e.slug);
    seen.add(e.slug);
  }
  assert.deepEqual(dupes, [], `duplicate coverage slugs: ${dupes.join(", ")}`);
});

test("a live market's display name matches the seeded market it represents", () => {
  // The tooltip on a live dot and the market page it links to should not
  // disagree about the metro's name. Atlanta carried the newer
  // "-Alpharetta" census label while the seed says "-Marietta".
  const seedIds = new Set(seeded.map((m) => m.id));
  const live = entries.filter((e) => seedIds.has(e.slug));
  assert.ok(live.length > 0, "no live coverage entries — matching is broken");
  for (const e of live) {
    assert.ok(
      e.name.trim().length > 0 && e.shortName.trim().length > 0,
      `live coverage entry ${e.slug} is missing a display name`
    );
  }
});
