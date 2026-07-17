# Phase 2 — Search-Index Name-Correction Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make `src/data/search_index.json` reflect operator name corrections (so a corrected operator is shown AND searchable by its new name), via a committed corrections export + an overlay in the offline index builder. DB stays the single source of truth.

**Architecture:** New exporter `export_name_corrections.ts` (DB → committed `src/data/name_corrections.json`) + a pure overlay helper applied inside `build-operator-universe.ts` before it writes the index. Ships with an empty corrections file (no-op) since no corrections exist in prod yet.

**Tech Stack:** TypeScript, tsx (Node scripts), Prisma (read-only), `node:test`.

## Global Constraints

- The pure helper `src/lib/operators/search-index-corrections.ts` must have **no `@/` imports and no IO** — `build-operator-universe.ts` imports it via a relative path under tsx.
- New unit tests under `src/lib/operators/` (in the CI test glob). CI gate = `npx tsc --noEmit` + `npm run test:watch-list`.
- Do NOT run `prisma db seed`/`migrate` (shared Neon). The exporter is read-only; it is NOT run against prod in this build — ship an EMPTY `src/data/name_corrections.json`.
- `build-operator-universe.ts` reads per-market source JSONs from `$IQ_DATA_DIR` (the Google Drive mount): `/Users/jonasbordo/Library/CloudStorage/GoogleDrive-jonas@dwellsy.com/Shared drives/Dwellsy Enterprise/Products/Operator IQ/Data Files`. Set it when running that script.
- Corrections target ranked PMs (by `slug`) and canonical groups (by `canonicalSlug`) only; never the tracked tier. An unmatched `pm` correction is EXPECTED (grouped member) — log, don't throw.
- End commits with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- Create `src/lib/operators/search-index-corrections.ts` — pure overlay helper.
- Create `src/lib/operators/search-index-corrections.test.ts` — unit tests.
- Create `scripts/data-pipeline/export_name_corrections.ts` — DB → committed export.
- Create `src/data/name_corrections.json` — empty committed baseline.
- Modify `scripts/build-operator-universe.ts` — read the export + apply the overlay before writing `search_index.json`.
- Modify `scripts/data-pipeline/MONTHLY_REFRESH.md` — document the export + rebuild step.

---

### Task 1: Pure overlay helper + tests (TDD)

**Files:**
- Create `src/lib/operators/search-index-corrections.ts`
- Test `src/lib/operators/search-index-corrections.test.ts`

**Interfaces:**
- Produces (consumed by Task 3): `applyNameCorrectionsToSearchIndex(index: { ranked: {slug:string;name:string}[]; canonical: {canonicalSlug:string;name:string}[] }, corrections: {targetKind:string;targetKey:string;correctedName:string}[]) => { matched: number; unmatched: string[] }`. Exported types `RankedEntryName`, `CanonicalEntryName`, `NameCorrection`.

- [ ] **Step 1: Write the failing test** `src/lib/operators/search-index-corrections.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { applyNameCorrectionsToSearchIndex } from "./search-index-corrections";

function idx() {
  return {
    ranked: [
      { slug: "acme-denver-co", name: "Acme" },
      { slug: "beta-denver-co", name: "Beta" },
    ],
    canonical: [{ canonicalSlug: "edward-rose-sons", name: "Edward Rose" }],
  };
}

test("pm correction overlays the ranked entry by slug", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "pm", targetKey: "acme-denver-co", correctedName: "ACME" },
  ]);
  assert.equal(i.ranked[0].name, "ACME");
  assert.equal(i.ranked[1].name, "Beta");
  assert.equal(r.matched, 1);
  assert.deepEqual(r.unmatched, []);
});

test("canonical correction overlays the canonical entry by canonicalSlug", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "canonical", targetKey: "edward-rose-sons", correctedName: "Edward Rose & Sons" },
  ]);
  assert.equal(i.canonical[0].name, "Edward Rose & Sons");
  assert.equal(r.matched, 1);
});

test("unmatched pm correction (grouped member) is reported, not thrown", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "pm", targetKey: "not-in-index", correctedName: "X" },
  ]);
  assert.equal(r.matched, 0);
  assert.deepEqual(r.unmatched, ["not-in-index"]);
  assert.equal(i.ranked[0].name, "Acme");
});

test("pm correction does not touch canonical tier (and vice-versa)", () => {
  const i = idx();
  applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "pm", targetKey: "acme-denver-co", correctedName: "ACME" },
  ]);
  assert.equal(i.canonical[0].name, "Edward Rose");
});

test("unknown targetKind is reported unmatched", () => {
  const i = idx();
  const r = applyNameCorrectionsToSearchIndex(i, [
    { targetKind: "weird", targetKey: "x", correctedName: "Y" },
  ]);
  assert.deepEqual(r.unmatched, ["x"]);
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `node --import tsx --test src/lib/operators/search-index-corrections.test.ts`
Expected: FAIL — `Cannot find module './search-index-corrections'`.

- [ ] **Step 3: Implement** `src/lib/operators/search-index-corrections.ts`:

```ts
// Pure overlay: apply admin name corrections onto the offline-built search
// index tiers so a corrected operator is shown + searchable by its new name.
// NO IO, NO "@/" imports — scripts/build-operator-universe.ts imports this via
// a relative path under tsx. Corrections target ranked PMs (by slug) and
// canonical groups (by canonicalSlug); the tracked tier is never targeted.

export interface RankedEntryName {
  slug: string;
  name: string;
}
export interface CanonicalEntryName {
  canonicalSlug: string;
  name: string;
}
export interface NameCorrection {
  targetKind: string;
  targetKey: string;
  correctedName: string;
}

/** Mutates the passed ranked/canonical entries' `name` fields in place.
 *  Returns how many corrections matched an entry, and the targetKeys that
 *  matched nothing (expected for a `pm` correction on a grouped member — it
 *  has no standalone ranked row — so callers log rather than fail). */
export function applyNameCorrectionsToSearchIndex(
  index: { ranked: RankedEntryName[]; canonical: CanonicalEntryName[] },
  corrections: NameCorrection[]
): { matched: number; unmatched: string[] } {
  const rankedBySlug = new Map<string, RankedEntryName>();
  for (const e of index.ranked) rankedBySlug.set(e.slug, e);
  const canonBySlug = new Map<string, CanonicalEntryName>();
  for (const e of index.canonical) canonBySlug.set(e.canonicalSlug, e);

  let matched = 0;
  const unmatched: string[] = [];
  for (const c of corrections) {
    let entry: RankedEntryName | CanonicalEntryName | undefined;
    if (c.targetKind === "pm") entry = rankedBySlug.get(c.targetKey);
    else if (c.targetKind === "canonical") entry = canonBySlug.get(c.targetKey);
    if (entry) {
      entry.name = c.correctedName;
      matched += 1;
    } else {
      unmatched.push(c.targetKey);
    }
  }
  return { matched, unmatched };
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `node --import tsx --test src/lib/operators/search-index-corrections.test.ts`
Expected: PASS — 5/5.

- [ ] **Step 5: tsc + commit**

Run: `npx tsc --noEmit` (expect exit 0).
```bash
git add src/lib/operators/search-index-corrections.ts src/lib/operators/search-index-corrections.test.ts
git commit -m "feat(operators): pure search-index name-correction overlay + tests"
```

---

### Task 2: Exporter + empty committed baseline

**Files:**
- Create `scripts/data-pipeline/export_name_corrections.ts`
- Create `src/data/name_corrections.json`

- [ ] **Step 1: Create the empty baseline** `src/data/name_corrections.json`:

```json
{
  "generatedAt": null,
  "corrections": []
}
```

- [ ] **Step 2: Create the exporter** `scripts/data-pipeline/export_name_corrections.ts` (mirrors `export_merge_decisions.ts`):

```ts
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
    select: { targetKind: true, targetKey: true, correctedName: true },
  });
  const corrections = rows
    .map((r) => ({
      targetKind: r.targetKind,
      targetKey: r.targetKey,
      correctedName: r.correctedName,
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
```

- [ ] **Step 3: tsc + commit** (do NOT run the exporter against prod — the baseline is intentionally empty)

Run: `npx tsc --noEmit` (expect exit 0).
```bash
git add scripts/data-pipeline/export_name_corrections.ts src/data/name_corrections.json
git commit -m "feat(pipeline): export_name_corrections + empty committed baseline"
```

---

### Task 3: Overlay in build-operator-universe + verify + runbook

**Files:**
- Modify `scripts/build-operator-universe.ts`
- Modify `scripts/data-pipeline/MONTHLY_REFRESH.md`

**Interfaces:**
- Consumes: `applyNameCorrectionsToSearchIndex` (Task 1); reads `src/data/name_corrections.json` (Task 2).

- [ ] **Step 1: Import the helper** — near the top imports of `scripts/build-operator-universe.ts`:

```ts
import { applyNameCorrectionsToSearchIndex } from "../src/lib/operators/search-index-corrections";
```

- [ ] **Step 2: Apply the overlay** — locate `const out: SearchIndex = { ranked, tracked, canonical };` (currently ~line 412) and the `fs.writeFileSync(outPath, JSON.stringify(out));` that follows (~line 417). Insert BETWEEN them:

```ts
// Phase 2 — overlay admin name corrections so a corrected operator is shown
// + searchable by its new name. Reads the committed export (build stays
// DB-free); an empty file is a no-op. A `pm` correction on a grouped member
// matches no ranked row and is reported as unmatched (expected).
const ncPath = path.resolve(__dirname, "../src/data/name_corrections.json");
if (fs.existsSync(ncPath)) {
  const nc = JSON.parse(fs.readFileSync(ncPath, "utf8"));
  const { matched, unmatched } = applyNameCorrectionsToSearchIndex(
    out,
    nc.corrections ?? []
  );
  console.log(
    `  name corrections: ${matched} applied, ${unmatched.length} unmatched (grouped/absent)`
  );
  if (unmatched.length) console.log(`    unmatched: ${unmatched.join(", ")}`);
}
```

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit`
Expected: exit 0. (Passing `out` — which has `ranked`/`tracked`/`canonical` — to the helper's `{ranked, canonical}` param type-checks: `out` is a variable, not a fresh literal, so no excess-property error; `OutputRankedEntry[]`/`OutputCanonicalEntry[]` are assignable to the helper's `{slug,name}[]`/`{canonicalSlug,name}[]`.)

- [ ] **Step 4: Verify the no-op rebuild** (Drive-dependent — the committed baseline is empty, so `search_index.json` must be UNCHANGED):

Run:
```bash
export IQ_DATA_DIR="/Users/jonasbordo/Library/CloudStorage/GoogleDrive-jonas@dwellsy.com/Shared drives/Dwellsy Enterprise/Products/Operator IQ/Data Files"
PYTHONHASHSEED=0 npx tsx scripts/build-operator-universe.ts
git diff --stat src/data/search_index.json
```
Expected: the run logs `name corrections: 0 applied, 0 unmatched`; `git diff --stat` shows **no change** to `search_index.json` (empty corrections = identical output). If it changed, STOP and report (the Drive source or seed drifted — not this task's doing).

- [ ] **Step 5: E2E proof the overlay actually rewrites the index** (Drive-dependent; temporary, reverted after):

Pick a real ranked slug from the current index:
```bash
node -e "const d=require('./src/data/search_index.json');console.log(d.ranked[0].slug, '|', d.ranked[0].name)"
```
Write a temporary correction into `src/data/name_corrections.json` for that slug with `correctedName` `"ZZZ OVERLAY TEST"` (targetKind `"pm"`), then:
```bash
PYTHONHASHSEED=0 npx tsx scripts/build-operator-universe.ts
grep -c "ZZZ OVERLAY TEST" src/data/search_index.json   # expect >= 1
```
Then REVERT both files so nothing temporary is committed:
```bash
git checkout src/data/name_corrections.json src/data/search_index.json
```
Confirm `git status --short` shows neither file dirty afterward.

- [ ] **Step 6: Update the runbook** — in `scripts/data-pipeline/MONTHLY_REFRESH.md`, add a short subsection (e.g. after the build-operator-universe step, or a new "Refreshing search after name corrections" note):

> **Refreshing search after operator name corrections.** Admin name corrections
> (`/admin/names`) are live in the app immediately and re-applied on every
> reseed, EXCEPT the global search index (`src/data/search_index.json`), a
> committed offline artifact. To refresh it: run
> `npx tsx scripts/data-pipeline/export_name_corrections.ts` (writes
> `src/data/name_corrections.json` from the DB — needs `DATABASE_URL`), then
> `IQ_DATA_DIR=… PYTHONHASHSEED=0 npx tsx scripts/build-operator-universe.ts`,
> then commit both files + deploy. The monthly refresh already runs
> build-operator-universe, so a monthly refresh also picks up corrections
> (run the exporter first).

- [ ] **Step 7: Commit** (only the two source files — the temp e2e edits were reverted; `search_index.json` and `name_corrections.json` are unchanged from their committed baselines):

```bash
git add scripts/build-operator-universe.ts scripts/data-pipeline/MONTHLY_REFRESH.md
git commit -m "feat(pipeline): overlay name corrections onto the search index"
```

---

## Notes for the implementer

- The overlay only runs at offline index-build time; there is no runtime/deploy change. With the empty committed baseline, this PR changes no generated artifact — `search_index.json` stays byte-identical.
- Do not run the exporter against prod; ship the empty baseline. Its first real run is Jonas's, once corrections exist.
- Tracked-tier entries are intentionally never corrected (Phase-1's admin search can't target them).
