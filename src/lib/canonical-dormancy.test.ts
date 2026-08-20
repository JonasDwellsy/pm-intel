import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// v0.8 dormant tier — dormancy on canonical (multi-market) search rows.
//
// The chip previously landed only on single-market ranked entries, so an
// operator dormant in every one of its markets still rendered as active on its
// rollup row — the row an owner is most likely to click. Searching "Bridge
// Property Management" returned 7 chipped per-market rows plus an unchipped
// "8 markets" row.
//
// THE RULE THESE TESTS PIN: label a canonical row only when EVERY member
// market is dormant. An operator quiet in some markets and listing in others
// is ordinary operator behaviour, and calling it dormant asserts something
// about their business we cannot observe. Same distinction the digest's
// simultaneity guardrail draws between Riparian (one market quiet — real) and
// Bridge (all markets quiet at once — a coverage fact).

const idx = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/search_index.json"), "utf8")
) as {
  canonical: Array<{
    name: string;
    canonicalSlug: string;
    marketCount: number;
    status?: string;
    lastListingDate?: string | null;
  }>;
  ranked: Array<{ slug: string; status?: string }>;
};

const seed = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/scorecard_data.json"), "utf8")
) as {
  pms: Array<{
    slug: string;
    canonicalOperatorId?: string;
    operatorStatus?: string;
    lastListingDate?: string | null;
  }>;
};

/** Member PMs of each canonical group, from the seed (the index doesn't carry
 *  pmSlugs — a check written against that field silently passes on nothing). */
function membersByCanonical(): Map<string, string[]> {
  const slugs = new Set(idx.canonical.map((c) => c.canonicalSlug));
  const out = new Map<string, string[]>();
  for (const p of seed.pms) {
    const cid = p.canonicalOperatorId;
    if (!cid || !slugs.has(cid)) continue;
    out.set(cid, [...(out.get(cid) ?? []), p.operatorStatus ?? "active"]);
  }
  return out;
}

test("a canonical row is chipped exactly when every member market is dormant", () => {
  const members = membersByCanonical();
  assert.ok(members.size > 0, "no canonical groups resolved — check is vacuous");

  const shouldChip = new Set(
    [...members.entries()]
      .filter(([, st]) => st.length > 0 && st.every((s) => s === "dormant"))
      .map(([slug]) => slug)
  );
  const didChip = new Set(
    idx.canonical.filter((c) => c.status === "dormant").map((c) => c.canonicalSlug)
  );

  assert.deepEqual(
    [...didChip].sort(),
    [...shouldChip].sort(),
    "chipped canonical rows must be exactly the fully-dormant ones"
  );
});

test("an operator quiet in only some of its markets is NOT chipped", () => {
  // The case that must stay silent. If this ever goes to zero the test has
  // stopped proving anything, so assert the population exists too.
  const members = membersByCanonical();
  const partial = [...members.entries()].filter(
    ([, st]) => st.some((s) => s === "dormant") && st.some((s) => s !== "dormant")
  );
  assert.ok(
    partial.length > 0,
    "no partially-dormant canonical operators in the data — this rule is untested"
  );
  for (const [slug] of partial) {
    const row = idx.canonical.find((c) => c.canonicalSlug === slug);
    assert.equal(
      row?.status,
      undefined,
      `${row?.name} is quiet in some markets but not all — it must carry no status`
    );
  }
});

test("every chipped canonical row carries the date we last saw a listing", () => {
  const dormant = idx.canonical.filter((c) => c.status === "dormant");
  assert.ok(dormant.length > 0, "no dormant canonical rows — check is vacuous");
  for (const c of dormant) {
    assert.match(
      c.lastListingDate ?? "",
      /^\d{4}-\d{2}-\d{2}$/,
      `${c.name} must carry a plain YYYY-MM-DD last-listing date`
    );
  }
});

test("the chipped date is the LATEST across the operator's markets", () => {
  // The point after which we observed nothing anywhere — the same choice the
  // coverage note makes in dormancy-guardrail.ts. Taking the earliest would
  // overstate how long the operator has been quiet.
  const bySlug = new Map<string, string[]>();
  const slugs = new Set(
    idx.canonical.filter((c) => c.status === "dormant").map((c) => c.canonicalSlug)
  );
  for (const p of seed.pms) {
    if (p.canonicalOperatorId && slugs.has(p.canonicalOperatorId) && p.lastListingDate) {
      bySlug.set(p.canonicalOperatorId, [
        ...(bySlug.get(p.canonicalOperatorId) ?? []),
        p.lastListingDate,
      ]);
    }
  }
  for (const c of idx.canonical.filter((x) => x.status === "dormant")) {
    const dates = bySlug.get(c.canonicalSlug) ?? [];
    if (!dates.length) continue;
    assert.equal(
      c.lastListingDate,
      dates.sort().at(-1),
      `${c.name} must report its most recent observed listing across markets`
    );
  }
});

test("no non-dormant canonical row gained a status key", () => {
  // Active rows must keep their exact prior shape so nothing is relabelled.
  const stray = idx.canonical.filter(
    (c) => "status" in c && c.status !== "dormant"
  );
  assert.deepEqual(stray, []);
});

test("Bridge — the case that motivated this — is chipped on its rollup row", () => {
  const bridge = idx.canonical.find((c) => c.name === "Bridge Property Management");
  assert.ok(bridge, "Bridge Property Management missing from the canonical tier");
  assert.equal(bridge.status, "dormant");
  // Its per-market rows were already chipped; the rollup was the gap.
  const perMarket = idx.ranked.filter((r) => r.slug.startsWith("bridge-property-management"));
  assert.ok(perMarket.length > 0);
  assert.ok(perMarket.every((r) => r.status === "dormant"));
});
