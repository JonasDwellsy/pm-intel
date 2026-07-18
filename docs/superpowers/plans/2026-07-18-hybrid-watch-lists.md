# Hybrid Watch Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one watch list hold criteria AND manual pins — criteria-presence (not `kind`) drives matching, any editable list can take pins, and rows that are both pinned and matched show a "Pinned + matches" badge.

**Architecture:** A pure `kind.ts` helper is the single source of truth (`hasCriteria` / `shouldSkipCriteriaMatch` / `deriveListKind`). `apply.ts` gains a `matched` flag and its pin-union marks an already-matched row `pinned:true` instead of dropping it. Callers pass `shouldSkipCriteriaMatch(wl)` instead of `kind==="pinned"`. UI (results table, pin popover, index, CSV) reads the derived kind + the `(matched, pinned)` pair. No schema/migration.

**Tech Stack:** TypeScript, Next.js/React, Prisma (no schema change), `node:test` for pure/apply tests, Vitest for components.

## Global Constraints

- **`skipCriteriaMatch` is keyed on criteria-presence**, never on `kind`. `shouldSkipCriteriaMatch(wl) === !hasCriteria(wl)`. A list with no criteria still shows only pins (empty criteria would otherwise "match everyone").
- **Entitlement safety preserved:** the pin union still reads only from the post-`isMarketEntitled` `allRecords`/`byCanonical`; a pinned company with zero entitled-market rows never surfaces. Do not change that.
- **No schema/migration.** The stored `WatchList.kind` column stays (creation intent) but is NOT read for behavior/display anymore — behavior/display derive from content via `kind.ts`.
- **`(matched, pinned)` semantics** after this change: `matched` = passed criteria; `pinned` = manually pinned. A row can be both. `pinned` no longer implies "not matched."
- CI gate: `npx tsc --noEmit` → `npm run test:watch-list` → `npm run test:components`.
- Preserve the `/results` ↔ `/changes` "both surfaces agree" invariant (both must pass the same `skipCriteriaMatch`).

---

## File Structure

- **Create** `src/lib/watch-list/kind.ts` (+ `kind.test.ts`) — pure helpers (T1).
- **Modify** `src/lib/watch-list/apply.ts` (+ `apply.test.ts`) — `matched` flag + union marks overlap (T2).
- **Modify** `src/app/watch-lists/[id]/results/page.tsx`, `src/app/watch-lists/[id]/changes/page.tsx`, `src/lib/watch-list/digest-run.ts` — pass `shouldSkipCriteriaMatch` (T3).
- **Modify** `src/lib/watch-list/results-view.ts`, `src/components/watch-list/ResultsTable.tsx` (+ component test) — thread `matched`, "Pinned + matches" badge, `canManageMembers` (T4).
- **Modify** `src/components/watch-list/AddToWatchList.tsx` (+ its test) — offer all own lists (T5).
- **Modify** `src/app/watch-lists/page.tsx`, `src/components/watch-list/WatchListIndex.tsx`, `src/lib/watch-list/export.ts` — derived kind label + hybrid card + CSV labeling (T6).

---

## Task 1: Pure derivation helpers (`kind.ts`)

**Files:** Create `src/lib/watch-list/kind.ts`, `src/lib/watch-list/kind.test.ts`.

**Interfaces produced (used by T2–T6):** `hasCriteria`, `shouldSkipCriteriaMatch`, `deriveListKind`, type `ListKind`.

- [ ] **Step 1: Write the failing test** — `src/lib/watch-list/kind.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { hasCriteria, shouldSkipCriteriaMatch, deriveListKind } from "./kind";

const empty = { requiredCriteria: [], preferredCriteria: [], excludedCriteria: [] };
const withReq = { requiredCriteria: [{}], preferredCriteria: [], excludedCriteria: [] };
const withPref = { requiredCriteria: [], preferredCriteria: [{}], excludedCriteria: [] };
const withExcl = { requiredCriteria: [], preferredCriteria: [], excludedCriteria: [{}] };

test("hasCriteria: empty is false; any non-empty axis is true", () => {
  assert.equal(hasCriteria(empty), false);
  assert.equal(hasCriteria(withReq), true);
  assert.equal(hasCriteria(withPref), true);
  assert.equal(hasCriteria(withExcl), true);
});

test("shouldSkipCriteriaMatch is the inverse of hasCriteria", () => {
  assert.equal(shouldSkipCriteriaMatch(empty), true);
  assert.equal(shouldSkipCriteriaMatch(withReq), false);
});

test("deriveListKind covers all four quadrants", () => {
  assert.equal(deriveListKind(withReq, 3), "hybrid"); // criteria + pins
  assert.equal(deriveListKind(withReq, 0), "smart"); // criteria only
  assert.equal(deriveListKind(empty, 3), "pinned"); // pins only
  assert.equal(deriveListKind(empty, 0), "pinned"); // neither → pinned (matches today's default)
});
```

- [ ] **Step 2: Run to verify it fails** — `node --import tsx --test src/lib/watch-list/kind.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/watch-list/kind.ts`:

```ts
// Pure, isomorphic derivation helpers — the single source of truth for
// whether a watch list has criteria, whether the criteria-match step
// should be skipped, and the list's derived display kind. No DB/React
// deps. Behavior/display now derive from content, NOT the stored
// `kind` column (which is retained only as creation intent).

type CriteriaShape = {
  requiredCriteria: readonly unknown[];
  preferredCriteria: readonly unknown[];
  excludedCriteria: readonly unknown[];
};

export type ListKind = "pinned" | "smart" | "hybrid";

export function hasCriteria(wl: CriteriaShape): boolean {
  return (
    wl.requiredCriteria.length > 0 ||
    wl.preferredCriteria.length > 0 ||
    wl.excludedCriteria.length > 0
  );
}

/** A list with no criteria must skip the natural criteria-match loops —
 *  an empty criteria set trivially "matches everyone" (see scoring.ts),
 *  which for a pins-only list would swamp the pin union. Keyed on
 *  criteria-presence so a pins-only list that GAINS criteria becomes
 *  hybrid automatically. */
export function shouldSkipCriteriaMatch(wl: CriteriaShape): boolean {
  return !hasCriteria(wl);
}

export function deriveListKind(wl: CriteriaShape, pinCount: number): ListKind {
  const criteria = hasCriteria(wl);
  const pins = pinCount > 0;
  if (criteria && pins) return "hybrid";
  if (criteria) return "smart";
  return "pinned";
}
```

- [ ] **Step 4: Run to verify pass** — `node --import tsx --test src/lib/watch-list/kind.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/watch-list/kind.ts src/lib/watch-list/kind.test.ts && git commit -m "feat(watch-list): pure kind/criteria derivation helpers"`

---

## Task 2: `apply.ts` — `matched` flag + pin-union marks overlap

**Files:** Modify `src/lib/watch-list/apply.ts`, `src/lib/watch-list/apply.test.ts`.

**Interfaces:** Consumes nothing new. Produces: `RankedTarget.matched?: boolean`, `RolledUpTarget.matched?: boolean`; union functions now flip `pinned` on already-matched rows.

- [ ] **Step 1: Add `matched` to both interfaces.** In `RankedTarget` (after the `pinned?` field, ~line 51) and `RolledUpTarget` (after its `pinned?`, ~line 77), add:

```ts
  /** True when this row passed the watch list's criteria. A row may be
   *  both matched and pinned (→ "Pinned + matches"). Display-only. */
  matched?: boolean;
```

- [ ] **Step 2: Set `matched: true` in the criteria loops.** In `computeCriteriaMatchedRecords` the pushed object (~line 319) and in `computeCriteriaMatchedOperators` the pushed object (~line 445), add `matched: true,` to each pushed target literal.

- [ ] **Step 3: `unionPinnedRecords` — flip `pinned` on overlap instead of skipping.** Replace the body's `alreadyMatched` Set + skip with a slug→row Map that mutates the existing matched row:

```ts
  if (pinnedKeys.size === 0) return matched;
  // Map by pmSlug so a pinned key that's ALSO a natural criteria match
  // flips that existing row's `pinned` flag (→ "Pinned + matches")
  // rather than being dropped. Only un-matched pinned keys become new
  // rows (pinned:true, matched left falsy).
  const matchedBySlug = new Map(matched.map((m) => [m.pmSlug, m]));
  const additions: RankedTarget[] = [];
  for (const pmRecord of allRecords) {
    const key = pmRecord.scorecard.canonicalOperatorId ?? pmRecord.slug;
    if (!pinnedKeys.has(key)) continue;
    const existing = matchedBySlug.get(pmRecord.slug);
    if (existing) {
      existing.pinned = true;
      continue;
    }
    const evaluation = evaluateWatchList(pmRecord, watchList);
    additions.push({
      // ... KEEP the existing pushed fields (pmSlug, name, marketId,
      // marketName, canonicalOperatorId, fitScore: evaluation.fitScore ?? 0,
      // breakdown, pm) ...
      pinned: true,
    });
  }
  return additions.length === 0 ? matched : matched.concat(additions);
```
(Keep the existing addition object's fields exactly; only the loop's already-matched branch changes from `continue` to `existing.pinned = true; continue;`, and `alreadyMatched` Set → `matchedBySlug` Map.)

- [ ] **Step 4: `unionPinnedOperators` — same pattern by `canonicalOperatorId`.** Replace `const alreadyMatched = new Set(matchedOperators.map((m) => m.canonicalOperatorId));` + the `if (alreadyMatched.has(key)) continue;` with:

```ts
  const matchedById = new Map(
    matchedOperators.map((m) => [m.canonicalOperatorId, m])
  );
  // ... inside the for (const key of pinnedKeys) loop, replace the
  // `if (alreadyMatched.has(key)) continue;` line with:
    const existingOp = matchedById.get(key);
    if (existingOp) {
      existingOp.pinned = true;
      continue;
    }
  // ... rest of the loop (bucket lookup + buildRolledUpTarget + push with
  // pinned:true) unchanged ...
```

- [ ] **Step 5: Write/extend the failing tests** in `apply.test.ts`. Add a test for the hybrid overlap (model the existing pin-union tests' fixtures):

```ts
test("hybrid list: a pinned company that also matches criteria yields ONE row flagged matched:true AND pinned:true", async () => {
  // A watch list WITH criteria (skipCriteriaMatch=false) + a pinned key
  // for a company that passes those criteria.
  const result = await applyWatchList(
    HYBRID_WATCHLIST, // required/preferred non-empty so it matches PIN_CO
    ENTITLEMENT_ALL,
    new Set([PINNED_KEY]),
    false // shouldSkipCriteriaMatch(HYBRID_WATCHLIST) === false
  );
  const rows = result.results.filter((r) => r.pmSlug === PINNED_PM_SLUG);
  assert.equal(rows.length, 1, "no duplicate row for pinned+matched");
  assert.equal(rows[0].matched, true);
  assert.equal(rows[0].pinned, true);
  // operator rollup carries the same pair
  const op = result.operatorResults.find((o) => o.canonicalOperatorId === PINNED_KEY);
  assert.equal(op?.matched, true);
  assert.equal(op?.pinned, true);
});

test("pins-only list (skipCriteriaMatch=true) still flags rows pinned:true, matched falsy", async () => {
  const result = await applyWatchList(PINS_ONLY_WATCHLIST, ENTITLEMENT_ALL, new Set([PINNED_KEY]), true);
  const row = result.results.find((r) => r.pmSlug === PINNED_PM_SLUG);
  assert.equal(row?.pinned, true);
  assert.ok(!row?.matched);
});

test("criteria-only match is matched:true, pinned falsy", async () => {
  const result = await applyWatchList(HYBRID_WATCHLIST, ENTITLEMENT_ALL, undefined, false);
  const row = result.results.find((r) => r.matched);
  assert.ok(row && !row.pinned);
});
```
Reuse the existing test file's fixture builders (there's already a `kind:'pinned'` pin-union test near line 363 — mirror its setup; define `HYBRID_WATCHLIST` with a `requiredCriteria`/`preferredCriteria` that the pinned fixture company satisfies). Confirm the existing entitlement-drop test (pinned company in a non-entitled market) still passes unchanged.

- [ ] **Step 6: Verify** — `node --import tsx --test src/lib/watch-list/apply.test.ts` → all pass; `npx tsc --noEmit` → 0.
- [ ] **Step 7: Commit** — `git commit -am "feat(watch-list): apply.ts matched flag + pin-union marks pinned+matched overlap"`

---

## Task 3: Callers pass `shouldSkipCriteriaMatch`

**Files:** `src/app/watch-lists/[id]/results/page.tsx`, `src/app/watch-lists/[id]/changes/page.tsx`, `src/lib/watch-list/digest-run.ts`.

**Interfaces:** Consumes `shouldSkipCriteriaMatch` (T1).

- [ ] **Step 1: results/page.tsx** — add `import { shouldSkipCriteriaMatch } from "@/lib/watch-list/kind";`. Replace `const isPinnedList = watchList.kind === "pinned";` (line ~78) with `const skipCriteria = shouldSkipCriteriaMatch(watchList);` and pass `skipCriteria` as the 4th arg to `applyWatchList` (was `isPinnedList`).

- [ ] **Step 2: changes/page.tsx** — same: import, replace `const isPinnedList = watchList.kind === "pinned";` (line ~73) → `const skipCriteria = shouldSkipCriteriaMatch(watchList);`, pass `skipCriteria` to `applyWatchList`.

- [ ] **Step 3: digest-run.ts** — same: import, replace `const isPinnedList = wl.kind === "pinned";` (line ~129) → `const skipCriteria = shouldSkipCriteriaMatch(wl);`, and pass `skipCriteria` wherever `isPinnedList` was fed to `applyWatchList`. (Grep the file for `isPinnedList` to catch every use.)

- [ ] **Step 4: Verify + commit** — `npx tsc --noEmit` → 0; `git commit -am "feat(watch-list): drive skipCriteriaMatch from criteria-presence, not kind"`

---

## Task 4: Results view — thread `matched` + "Pinned + matches" badge

**Files:** `src/lib/watch-list/results-view.ts`, `src/components/watch-list/ResultsTable.tsx` (+ a Vitest component test).

**Interfaces:** Consumes `RankedTarget.matched`/`RolledUpTarget.matched` (T2). Produces `ResultRowVM.matched`.

- [ ] **Step 1: `results-view.ts`** — add `matched?: boolean` to the `ResultRowVM` interface (next to `pinned`), and in the projector(s) that build `ResultRowVM` from `RankedTarget`/`RolledUpTarget`, copy it through: `matched: target.matched ?? false,` everywhere `pinned: target.pinned ?? false,` is set. (Grep `results-view.ts` for `pinned` to find each projection site.)

- [ ] **Step 2: ResultsTable badge** — replace the pinned badge block (~lines 406-413):

```tsx
            {row.pinned && (
              <span
                className="dq-pill dq-pill-teal text-[10.5px]"
                title={
                  row.matched
                    ? "Manually pinned; also matches this list's criteria."
                    : "Manually pinned to this watch list."
                }
              >
                {row.matched ? "Pinned + matches" : "Pinned"}
              </span>
            )}
```

- [ ] **Step 3: `canManageMembers` gate** — the page computes `canManageMembers` as `watchList.kind === "pinned" && canEditList(...)`. Change it to `canEditList(...)` alone (drop the kind clause) at the call site that passes `canManageMembers` into `ResultsTable` (in `results/page.tsx`). Unpin controls then show on any editable list that has pins; the per-row `render` already guards on `row.pinned`, so match-only rows show no remove button. Update the ResultsTable comment at ~line 534-537 accordingly.

- [ ] **Step 4: Component test** (`ResultsTable.test.tsx`, Vitest — mirror existing component tests): render a row with `{ pinned: true, matched: true }` → asserts "Pinned + matches" present; a row `{ pinned: true, matched: false }` → "Pinned"; a row `{ pinned: false, matched: true }` → neither pinned badge. (If ResultsTable is awkward to render standalone, test the badge via the smallest renderable unit; keep it a real assertion, not a tautology.)

- [ ] **Step 5: Verify + commit** — `npx tsc --noEmit` → 0; `npm run test:components` green; `git commit -am "feat(watch-list): Pinned + matches badge; manage pins on any editable list"`

---

## Task 5: Pin popover offers any editable list

**Files:** `src/components/watch-list/AddToWatchList.tsx` (+ `AddToWatchList.test.tsx`).

- [ ] **Step 1: Offer all own lists.** Replace the list filter (line ~102) `.filter((w) => w.kind === "pinned" && w.ownerId === userId)` with `.filter((w) => w.ownerId === userId)` — keep the owner-only gate (can't pin to a shared view-only list), drop the `kind` gate so smart/hybrid lists appear.

- [ ] **Step 2: Relabel copy** — update the popover header/comments from "pinned lists" / "pick lists" to "your watch lists" (the header string the popover renders, and the file's top doc-comment). "+ New list…" still POSTs `kind:"pinned"` (a fresh list has no criteria → derives as pinned) — leave that as-is.

- [ ] **Step 3: Update the component test** — in `AddToWatchList.test.tsx`, the fetch mock for `GET /api/watch-lists` should include a `kind:"criteria"` (smart) list owned by the user and assert it now appears as a pin target (previously filtered out). Keep the existing pinned-list assertions.

- [ ] **Step 4: Verify + commit** — `npx tsc --noEmit` → 0; `npm run test:components` green; `git commit -am "feat(watch-list): allow pinning a company onto any of your watch lists"`

---

## Task 6: Index + CSV — derived kind label

**Files:** `src/app/watch-lists/page.tsx`, `src/components/watch-list/WatchListIndex.tsx`, `src/lib/watch-list/export.ts`.

**Interfaces:** Consumes `deriveListKind`/`hasCriteria` (T1) and `matched` (T2).

- [ ] **Step 1: page.tsx — pin counts for ALL rows.** The index currently computes `pinnedCounts` only for `kind === "pinned"` rows (line ~109-115). Change it to compute `listMembers(...).length` for every row (so hybrid/smart rows with pins get a count). Keep passing `pinnedCounts` to `WatchListIndex`.

- [ ] **Step 2: WatchListIndex — derived label + hybrid card.** Import `deriveListKind`/`hasCriteria`. Per row compute `const kind = deriveListKind(bb, pinnedCounts[bb.id] ?? 0);`. Replace the two `bb.kind === "pinned"` uses (lines ~111, ~124):
  - Pill (line ~111): show `kind === "pinned" ? "Pick list" : kind === "hybrid" ? "Hybrid" : "Smart list"` (render the pill for pinned + hybrid; keep no pill or a "Smart list" pill for smart — match the existing visual weight).
  - Body (line ~124): for `kind === "hybrid"`, render BOTH the criteria chips (required/preferred/excluded) AND the "N companies" pin line; for `pinned`, just the pin line; for `smart`, just the criteria chips. (Reuse the existing two branches; add the hybrid case that shows both.)

- [ ] **Step 3: export.ts — per-row labeling.** Replace `const isPinnedList = watchList.kind === "pinned";` (line ~128) with per-row logic using the `ResultRowVM.matched`/`pinned` flags now available. Read the surrounding CSV column logic and label each row's inclusion reason as "matches" (`matched && !pinned`), "pinned" (`pinned && !matched`), or "pinned + matches" (`pinned && matched`). Keep the CSV column set unchanged (no new columns) — only the value/label logic changes. (If `export.ts` used `isPinnedList` to decide whether to emit a fit-score column at all, keep that decision keyed on `hasCriteria(watchList)` instead.)

- [ ] **Step 4: Verify + commit** — `npx tsc --noEmit` → 0; `npm run test:watch-list` (export tests) + `npm run test:components` green; `git commit -am "feat(watch-list): derived pinned/smart/hybrid label in index + CSV"`

---

## Task 7: Full gate + review + PR

- [ ] **Step 1: Full CI gate** — `npx prisma generate && npx tsc --noEmit && npm run test:watch-list && npm run test:components` → all green (includes new `kind` tests + extended apply tests). If stale `.next/types/validator.ts` errors appear, `rm -f .next/types/validator.ts .next/dev/types/validator.ts` and re-run tsc.
- [ ] **Step 2: Grep audit** — `grep -rn 'kind === "pinned"' src --include="*.ts" --include="*.tsx" | grep -v "\.test\."` → the only remaining hits should be intentional (e.g., the island's "+ New list" POST body `kind:"pinned"`); no behavior/display branch should still gate on stored `kind`.
- [ ] **Step 3: Final whole-branch review** (opus) + address findings.
- [ ] **Step 4: Finish** — superpowers:finishing-a-development-branch → push + PR (Jonas merges via "merge N").

---

## Self-Review (completed during planning)

- **Spec coverage:** criteria-presence gate ✓ (T1/T3); `matched` flag + union-marks-overlap ✓ (T2); "Pinned + matches" badge ✓ (T4); pin-to-any-list ✓ (T5); derived kind label in index + CSV ✓ (T6); Edit→criteria-editor now correct for all lists (no code change needed — falls out of the model; note in PR). Entitlement safety untouched (T2 union still reads post-entitlement records). No schema change.
- **Type consistency:** `matched?: boolean` added to `RankedTarget`, `RolledUpTarget`, and `ResultRowVM`, threaded through the projector; `deriveListKind`/`hasCriteria`/`shouldSkipCriteriaMatch` signatures used identically across T3/T6.
- **Placeholders:** none — T1/T2 carry full code; T3–T6 give exact old→new strings + sites. The two "grep the file for each `pinned`/`isPinnedList` site" steps are bounded by the final grep-audit gate.
- **Known nuance to watch (flag in review, not necessarily fix):** `TargetListResult.matchedCount`/`matchedOperatorCount` count all result rows including pin-only ones, so a hybrid/pinned list's "X of Y match" headline can overstate matches. If the results headline reads oddly for hybrids, base it on `matched`-flagged rows. Left as a review check to avoid scope creep.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-18-hybrid-watch-lists.md`. Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — batch with checkpoints.

Which approach?
