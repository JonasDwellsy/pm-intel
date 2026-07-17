# Richer Search: Markets + Aliases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make global search (a) find **markets** (city/metro/state → market page) and (b) find operators by **DBA** and **former (pre-correction) names** — one Fuse corpus.

**Architecture:** Offline index enrichment + client render — no DB/runtime change. `build-operator-universe.ts` emits a new `market` tier + `aliases` on entries into `search_index.json`; `pm-search.ts` adds the `market` tier + an `aliases` Fuse key; the search UI renders a Markets group + an "also:" alias line. Former-name aliases flow from the corrections export.

**Tech Stack:** TypeScript, tsx scripts, Fuse.js, React (Next.js), `node:test` (pure), Vitest + Testing Library (component).

## Global Constraints

- Pure helper modules under `src/lib/operators/` must have **no `@/` imports, no IO** (imported by `build-operator-universe.ts` via relative path under tsx). New pure tests go under `src/lib/operators/` (in the `test:watch-list` glob).
- CI gate = `tsc --noEmit` + `npm run test:watch-list` + `npm run test:components` (all three, post-#221).
- The discriminator field stays **`tier`** (type `PMSearchTier`); add `"market"` as a fourth value — do NOT rename to `kind`.
- `build-operator-universe.ts` needs `IQ_DATA_DIR` = the Drive mount: `/Users/jonasbordo/Library/CloudStorage/GoogleDrive-jonas@dwellsy.com/Shared drives/Dwellsy Enterprise/Products/Operator IQ/Data Files`.
- Do NOT run `prisma db seed`/`migrate` or the corrections exporter against prod.
- Market results pass `filterResultsByEntitlement` like `canonical` (always shown) — market pages are public.
- Market href = `/property-managers/<stateSlug>/<citySlug>` (ranked href minus the `/<slug>`).
- End commits with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Create `src/lib/operators/search-index-aliases.ts` + `.test.ts` — pure alias helpers.
- Modify `src/lib/operators/search-index-corrections.ts` + `.test.ts` — former-name → aliases.
- Modify `scripts/data-pipeline/export_name_corrections.ts` — emit `originalName`.
- Modify `scripts/build-operator-universe.ts` — `market` tier + DBA aliases; regenerate `src/data/search_index.json`.
- Modify `src/lib/pm-search.ts` (+ new `src/lib/pm-search.test.ts`) — `market` tier, `aliases` key, `matchedAlias`, partition/filter/counts.
- Modify `src/components/search/SearchResultRow.tsx` — `market` branch + "also:" line.
- Modify `src/components/search/SearchInput.tsx` + `SearchModal.tsx` — Markets group.
- Create `src/components/search/SearchResultRow.test.tsx` — Vitest component test.

---

### Task 1: Pure alias helpers + former-name wiring (TDD)

**Files:** create `src/lib/operators/search-index-aliases.ts` (+ `.test.ts`); modify `src/lib/operators/search-index-corrections.ts` (+ `.test.ts`).

**Interfaces (produced, consumed by Tasks 2 & 4):**
- `addAlias(aliases: string[], candidate: string | null | undefined, primary: string): void`
- `dbaAlias(name: string, canonicalOperatorName?: string | null): string | null`
- `search-index-corrections`: `NameCorrection` gains `originalName?: string`; `RankedEntryName`/`CanonicalEntryName` gain `aliases?: string[]`; the matched branch pushes `originalName` onto `entry.aliases`.

- [ ] **Step 1: Write failing tests** `src/lib/operators/search-index-aliases.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { addAlias, dbaAlias } from "./search-index-aliases";

test("dbaAlias returns the DBA when it differs from the name", () => {
  assert.equal(dbaAlias("Haven Residential", "29th Street Property Management"), "29th Street Property Management");
});
test("dbaAlias returns null when equal, casing-only, or empty", () => {
  assert.equal(dbaAlias("Acme", "acme"), null);
  assert.equal(dbaAlias("Acme", "Acme"), null);
  assert.equal(dbaAlias("Acme", null), null);
  assert.equal(dbaAlias("Acme", "  "), null);
});
test("addAlias adds a genuine alias, trims, and skips empties/same-as-primary/dupes", () => {
  const a: string[] = [];
  addAlias(a, "  Old Name  ", "New Name");
  addAlias(a, "new name", "New Name"); // same as primary (casing) → skip
  addAlias(a, "", "New Name"); // empty → skip
  addAlias(a, null, "New Name"); // null → skip
  addAlias(a, "OLD NAME", "New Name"); // dupe (casing) → skip
  assert.deepEqual(a, ["Old Name"]);
});
```

- [ ] **Step 2: Run — verify fail** — `node --import tsx --test src/lib/operators/search-index-aliases.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/operators/search-index-aliases.ts`:

```ts
// Pure alias helpers for the search index. NO IO, NO "@/" imports —
// build-operator-universe.ts (and search-index-corrections.ts) import this
// via relative paths under tsx.

/** Push `candidate` onto `aliases` iff it's non-empty, differs
 *  case-insensitively from `primary` (the display name), and isn't already
 *  present (case-insensitive). Trims. Mutates `aliases`. */
export function addAlias(
  aliases: string[],
  candidate: string | null | undefined,
  primary: string
): void {
  if (!candidate) return;
  const c = candidate.trim();
  if (!c) return;
  if (c.toLowerCase() === primary.trim().toLowerCase()) return;
  if (aliases.some((a) => a.toLowerCase() === c.toLowerCase())) return;
  aliases.push(c);
}

/** The DBA/operating-company alias for a single-market operator: its
 *  canonicalOperatorName when it differs case-insensitively from its display
 *  name (the exact rule toPmListItem uses for displayName). Null otherwise. */
export function dbaAlias(
  name: string,
  canonicalOperatorName?: string | null
): string | null {
  if (!canonicalOperatorName) return null;
  const c = canonicalOperatorName.trim();
  if (!c || c.toLowerCase() === name.trim().toLowerCase()) return null;
  return c;
}
```

- [ ] **Step 4: Run — verify pass** — same command → PASS (3/3).

- [ ] **Step 5: Extend `search-index-corrections.ts`** — (a) `import { addAlias } from "./search-index-aliases";`; (b) add `originalName?: string` to `NameCorrection`; (c) add `aliases?: string[]` to `RankedEntryName` and `CanonicalEntryName`; (d) in the `if (entry) { ... }` matched branch, AFTER `entry.name = c.correctedName;`, add:

```ts
      if (c.originalName) {
        const list = (entry.aliases = entry.aliases ?? []);
        addAlias(list, c.originalName, c.correctedName);
      }
```

- [ ] **Step 6: Add a former-name test** to `src/lib/operators/search-index-corrections.test.ts` — a correction with `originalName` different from `correctedName` pushes it onto the matched entry's `aliases`; an `originalName` equal (casing) to `correctedName` adds nothing. (Follow the file's existing `idx()` fixture + add `originalName` to the correction objects.)

- [ ] **Step 7: Run both suites + tsc + commit**

Run: `node --import tsx --test src/lib/operators/search-index-aliases.test.ts src/lib/operators/search-index-corrections.test.ts` → all pass; `npx tsc --noEmit` → 0.
```bash
git add src/lib/operators/search-index-aliases.ts src/lib/operators/search-index-aliases.test.ts src/lib/operators/search-index-corrections.ts src/lib/operators/search-index-corrections.test.ts
git commit -m "feat(operators): alias helpers + former-name aliases in the correction overlay"
```

---

### Task 2: build-operator-universe — market tier + DBA aliases + regenerate index

**Files:** modify `scripts/build-operator-universe.ts`; regenerate `src/data/search_index.json` (Drive).

**Interfaces:** consumes `dbaAlias`, `addAlias` (Task 1). Produces a new `markets` array + `aliases` fields in `search_index.json` (consumed by Task 4).

- [ ] **Step 1: Import helpers** near the top of `scripts/build-operator-universe.ts`:

```ts
import { dbaAlias, addAlias } from "../src/lib/operators/search-index-aliases";
```

- [ ] **Step 2: Add types.** Add `aliases?: string[]` to `OutputRankedEntry` and `OutputCanonicalEntry`. Add a new type + include it in `SearchIndex`:

```ts
interface OutputMarketEntry {
  tier: "market";
  name: string; // "Denver, CO"
  marketId: string;
  marketCity: string;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
  operatorCount: number;
  aliases?: string[];
}
```
`type SearchIndex = { ranked: OutputRankedEntry[]; tracked: OutputTrackedEntry[]; canonical: OutputCanonicalEntry[]; markets: OutputMarketEntry[]; };`

- [ ] **Step 3: Ranked DBA aliases.** In the `ranked.push({...})` block, after the existing fields add:
```ts
    aliases: (() => { const a: string[] = []; addAlias(a, dbaAlias(pm.name, pm.canonicalOperatorName), pm.name); return a.length ? a : undefined; })(),
```

- [ ] **Step 4: Canonical member aliases.** In the first pass over `seed.pms` (the loop that builds `starsByCanonicalSlug`), also accumulate member names per canonical slug:
```ts
  // (declare once above the loop:) const namesByCanonicalSlug = new Map<string, Set<string>>();
  // (inside the loop, when canonSlug && canonicalMap[canonSlug]:)
      const nameSet = namesByCanonicalSlug.get(canonSlug) ?? new Set<string>();
      if (pm.name) nameSet.add(pm.name);
      if (pm.canonicalOperatorName) nameSet.add(pm.canonicalOperatorName);
      namesByCanonicalSlug.set(canonSlug, nameSet);
```
Then in the `canonical.push({...})` block, after the existing fields:
```ts
    aliases: (() => { const a: string[] = []; for (const n of namesByCanonicalSlug.get(entity.canonicalSlug) ?? []) addAlias(a, n, entity.canonicalName); return a.length ? a : undefined; })(),
```

- [ ] **Step 5: Build market entries.** Read `markets-summary.json` and emit one entry per market from the in-file `MARKETS` array (its `stateSlug`/`citySlug` are authoritative). Insert before `const out`:
```ts
const summaryPath = path.resolve(__dirname, "../src/data/markets-summary.json");
const summaryById = new Map<string, { operatorCountEligible?: number; fullName?: string }>();
if (fs.existsSync(summaryPath)) {
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  for (const m of summary.markets ?? []) summaryById.set(m.id, m);
}
const markets: OutputMarketEntry[] = MARKETS.map((m) => {
  const s = summaryById.get(m.id);
  const name = `${m.city}, ${m.state}`;
  const aliases: string[] = [];
  addAlias(aliases, s?.fullName, name);   // "Denver-Aurora-Lakewood, CO MSA"
  addAlias(aliases, m.city, name);        // bare city
  addAlias(aliases, m.stateSlug, name);   // state name, e.g. "colorado"
  return {
    tier: "market" as const,
    name,
    marketId: m.id,
    marketCity: m.city,
    stateCode: m.state,
    stateSlug: m.stateSlug,
    citySlug: m.citySlug,
    operatorCount: s?.operatorCountEligible ?? 0,
    aliases: aliases.length ? aliases : undefined,
  };
});
```
- [ ] **Step 6: Emit it.** Change `const out: SearchIndex = { ranked, tracked, canonical };` → `{ ranked, tracked, canonical, markets };`. (The name-correction overlay call stays as-is; it only touches ranked/canonical.) Add a log line: `console.log(\`  markets: ${markets.length}\`);`.

- [ ] **Step 7: tsc** — `npx tsc --noEmit` → 0.

- [ ] **Step 8: Regenerate the index (Drive).**
```bash
export IQ_DATA_DIR="/Users/jonasbordo/Library/CloudStorage/GoogleDrive-jonas@dwellsy.com/Shared drives/Dwellsy Enterprise/Products/Operator IQ/Data Files"
PYTHONHASHSEED=0 npx tsx scripts/build-operator-universe.ts
```
Verify the new index: `node -e "const d=require('./src/data/search_index.json'); console.log('markets',d.markets.length,'| ranked',d.ranked.length,'| canonical',d.canonical.length,'| ranked w/alias',d.ranked.filter(r=>r.aliases).length,'| canon w/alias',d.canonical.filter(c=>c.aliases).length)"` → expect `markets 35`, ranked/canonical counts unchanged vs. the committed baseline (check `git diff` doesn't drop entries), and some alias counts > 0.

- [ ] **Step 9: Commit** (`build-operator-universe.ts` + the regenerated `src/data/search_index.json`):
```bash
git add scripts/build-operator-universe.ts src/data/search_index.json
git commit -m "feat(pipeline): emit market tier + DBA aliases into the search index"
```

---

### Task 3: export_name_corrections emits originalName

**Files:** modify `scripts/data-pipeline/export_name_corrections.ts`.

- [ ] **Step 1:** In the `findMany` `select`, add `originalName: true`. In the `.map`, add `originalName: r.originalName`. (Keep the sort as-is.) This lets the overlay (Task 1) turn a corrected operator's former name into a searchable alias on the next index rebuild. `name_corrections.json` stays the empty baseline (no prod run).
- [ ] **Step 2:** `npx tsc --noEmit` → 0. Commit:
```bash
git add scripts/data-pipeline/export_name_corrections.ts
git commit -m "feat(pipeline): export originalName for former-name search aliases"
```

---

### Task 4: pm-search — market tier + aliases key + matchedAlias

**Files:** modify `src/lib/pm-search.ts`; create `src/lib/pm-search.test.ts`.

**Interfaces:** consumed by Task 5 (the UI reads `tier === "market"`, `result.operatorCount`, `result.matchedAlias`; `partitionByTier` gains a `market` bucket).

- [ ] **Step 1:** Add `"market"` to `PMSearchTier`. Add a `market` arm to `PMSearchResult` and the matching `IndexFile.markets?` + entry shape (mirror `OutputMarketEntry`, plus `href` and `score`; include `aliases?: string[]` and `matchedAlias?: string`). Add `aliases?: string[]` to the ranked + canonical result arms and `IndexFile` entries too.
- [ ] **Step 2:** `buildHref` — add a `market` branch returning `/property-managers/${entry.stateSlug}/${entry.citySlug}`.
- [ ] **Step 3:** Corpus assembly — add `for (const e of data.markets ?? []) corpus.push({ ...e, href: buildHref(e) } as IndexedEntry);`.
- [ ] **Step 4:** `FUSE_OPTIONS` — add the alias key + turn on match info:
```ts
  keys: [ { name: "name", weight: 1.0 }, { name: "aliases", weight: 0.5 } ],
  ...
  includeScore: true,
  includeMatches: true,
```
- [ ] **Step 5:** `searchPMs` — after mapping, derive `matchedAlias` from the Fuse match whose `key === "aliases"`:
```ts
  return matches.map((m) => {
    const aliasMatch = m.matches?.find((mm) => mm.key === "aliases");
    return {
      ...(m.item as IndexedEntry),
      score: m.score ?? 1,
      ...(aliasMatch?.value ? { matchedAlias: aliasMatch.value } : {}),
    };
  }) as PMSearchResult[];
```
- [ ] **Step 6:** `partitionByTier` — add a `markets` bucket (`Extract<PMSearchResult, { tier: "market" }>[]`) and route `r.tier === "market"` into it; update the return type. `filterResultsByEntitlement` — `r.tier === "canonical" || r.tier === "market" ? true : entitled.has(r.marketId)`. `getSearchCounts` — include `data.markets?.length ?? 0` (add a `markets` count field; update its consumers' copy minimally).
- [ ] **Step 7:** Create `src/lib/pm-search.test.ts` (node:test) covering the PURE functions with fabricated results: `partitionByTier` routes a `market` result into the new bucket; `filterResultsByEntitlement` passes a `market` result even when `entitled` is a Set not containing its marketId. (These don't depend on the real index.)
- [ ] **Step 8:** `npx tsc --noEmit` → 0; `node --import tsx --test src/lib/pm-search.test.ts` → pass. Commit:
```bash
git add src/lib/pm-search.ts src/lib/pm-search.test.ts
git commit -m "feat(search): market tier + alias matching in pm-search"
```

---

### Task 5: Search UI — Markets group + alias line + component test

**Files:** modify `src/components/search/SearchResultRow.tsx`, `SearchInput.tsx`, `SearchModal.tsx`; create `src/components/search/SearchResultRow.test.tsx`.

- [ ] **Step 1: `SearchResultRow.tsx` — market subtitle branch.** Extend the `subtitle` builder: when `result.tier === "market"`, render `<><span className="dq-mono">{result.operatorCount}</span> operators</>`. (Keep the canonical + ranked/tracked branches.)
- [ ] **Step 2: `SearchResultRow.tsx` — market badge + no star chip.** In the name `<p>`, add a `market` badge alongside the existing canonical badge: when `result.tier === "market"`, render a `<span>` badge "Market" (same classes as the "Cross-market" badge). The `StarChip` condition already excludes market (`ranked || canonical`) — leave as-is.
- [ ] **Step 3: `SearchResultRow.tsx` — alias line.** Under the subtitle `<p>`, when `result.matchedAlias` is set, add: `<p className={\`mt-0.5 truncate text-muted-2 ${subSize}\`}>also: {result.matchedAlias}</p>`.
- [ ] **Step 4: `SearchInput.tsx`** — pull `markets` from `partitionByTier` and render a **"Markets"** group (mirror the canonical group block at ~:351-368; key `market-${r.marketId}`) placed FIRST (before Cross-market). Include it in the `allResults`/active-index ordering consistently.
- [ ] **Step 5: `SearchModal.tsx`** — same: add a `markets` group block (mirror the canonical block at ~:224-242; `size="comfortable"`, key `market-${r.marketId}`) placed first.
- [ ] **Step 6: Component test (Vitest)** `src/components/search/SearchResultRow.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResultRow } from "./SearchResultRow";
import type { PMSearchResult } from "@/lib/pm-search";

const market: PMSearchResult = {
  tier: "market", name: "Denver, CO", marketId: "denver-co", marketCity: "Denver",
  stateCode: "CO", stateSlug: "colorado", citySlug: "denver", operatorCount: 145,
  href: "/property-managers/colorado/denver", score: 0,
} as PMSearchResult;

const aliased: PMSearchResult = {
  tier: "ranked", name: "29th Street Property Management", slug: "x-denver-co",
  marketId: "denver-co", marketCity: "Denver", stateCode: "CO", stateSlug: "colorado",
  citySlug: "denver", goldCount: 0, silverCount: 0, t12Listings: 10,
  href: "/property-managers/colorado/denver/x-denver-co", score: 0,
  matchedAlias: "Haven Residential",
} as PMSearchResult;

describe("SearchResultRow", () => {
  it("renders a market row: badge, operator count, market href, no star chip", () => {
    render(<ul><SearchResultRow result={market} active={false} /></ul>);
    expect(screen.getByText("Market")).toBeTruthy();
    expect(screen.getByText("145")).toBeTruthy();
    expect(screen.getByRole("link")).toHaveProperty("href", expect.stringContaining("/property-managers/colorado/denver"));
  });
  it("shows an 'also:' line when a result matched on an alias", () => {
    render(<ul><SearchResultRow result={aliased} active={false} /></ul>);
    expect(screen.getByText(/also:/)).toBeTruthy();
    expect(screen.getByText(/Haven Residential/)).toBeTruthy();
  });
});
```
(If `toHaveProperty(...expect.stringContaining)` is awkward under the matchers available, assert `screen.getByRole("link").getAttribute("href")` contains the path instead.)

- [ ] **Step 7: Verify + commit** — `npx tsc --noEmit` → 0; `npm run test:components` → passes (incl. the new file); `npm run test:watch-list` → passes. Commit:
```bash
git add src/components/search/SearchResultRow.tsx src/components/search/SearchInput.tsx src/components/search/SearchModal.tsx src/components/search/SearchResultRow.test.tsx
git commit -m "feat(search): Markets result group + alias line in search UI"
```

---

### Task 6: End-to-end verification + PR

- [ ] **Step 1: Full CI gate** — `npx prisma generate && npx tsc --noEmit && npm run test:watch-list && npm run test:components` → all green.
- [ ] **Step 2: Preview smoke** (optional, if a dev server is convenient): search "Denver" → a Market result appears and routes to the market page; an operator with a DBA still resolves. (Search-by-former-name only demonstrable once a real correction exists.)
- [ ] **Step 3: Open PR** for `search-markets-aliases`. Note: `search_index.json` regenerated (gains 35 market entries + DBA aliases); former-name aliases dormant until a correction is exported; refreshes on the build-operator-universe rebuild / monthly refresh.

## Notes for the implementer

- Keep `tier` as the discriminator (do not rename to `kind`).
- The pure modules stay `@/`-free and IO-free (seed/tsx import them relatively).
- Task 2 changes `search_index.json` — confirm the ranked/tracked/canonical entry COUNTS are unchanged vs. the committed baseline (only additive: a `markets` array + optional `aliases`), so no operator dropped out.
