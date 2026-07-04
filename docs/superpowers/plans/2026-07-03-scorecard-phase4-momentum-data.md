# Scorecard Phase 4 — Momentum Data Wiring (Option 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the redesigned scorecard's Rent-tier marker, two more Momentum sparklines (Geographic reach, Operating quality), and two net-new trend Watch-Items (concession-spike, rating/eligibility change) — all from data that already exists in `OperatorSnapshot` / the seed, with **no DB migration, no re-seed, no pipeline or backfill changes**.

**Architecture:** Pure derivation in `src/lib/scorecard/` consumed by the existing `buildScorecardView`. The trajectory loader is widened to surface two already-stored snapshot columns (`topSubmarkets` → submarket count, `concessionRate`). Rent-tier gets its own small pure module (decoupled from the retiring `lending-signals.ts`). The view-model wires everything; the dev-preview fixture is updated so the new states are visible.

**Tech Stack:** TypeScript, Next.js 16 App Router, Prisma (read-only here), `node:test` + `node:assert` run via `npm run test:watch-list`.

## Global Constraints

- **Never surface raw rank/composite.** The Operating-quality sparkline is derived from per-snapshot star weight but MUST render as a direction/line only — never print the numeric series values. (The `MomentumSection` already renders lines without numbers; do not change that.)
- **Facts-not-judgments voice** for all new copy; Watch-Item explanations stay plain-English and specific.
- **Option 1 scope only:** no Prisma migration, no `prisma db seed`, no changes to `scripts/data-pipeline/*` or `scripts/backfill-trajectory.ts`. The **Listing-share** sparkline stays deferred (empty series) — do not attempt to populate it.
- **Back-compat:** `buildWatchItems(scorecard, marketConcessionMedian)` (2 args, no trajectory) must keep working unchanged — the trajectory arg is optional.
- **Test harness:** `import test from "node:test"; import { strict as assert } from "node:assert";`. Every task runs `npm run test:watch-list` and must keep the whole suite green (currently 301 tests).
- **methodologyVersion is unaffected** (stays `v0.6.4`).

---

### Task 1: Trajectory loader — expose submarket count + concession rate

**Files:**
- Modify: `src/lib/operators/trajectory.ts` (add fields to `TrajectoryPoint`, a pure parse helper, and two `select` columns)
- Test: `src/lib/operators/trajectory.test.ts`

**Interfaces:**
- Produces: `parseSubmarketCount(topSubmarkets: string | null): number | null`; `TrajectoryPoint` gains **optional** `submarketCount?: number | null` and `concessionRate?: number | null`.
- Note: the new fields are **optional** on purpose — `AggregateTrajectoryPoint extends TrajectoryPoint` and `aggregateMemberSnapshots` build points without them; optional keeps that code and the `pt()` test helper compiling unchanged.

- [ ] **Step 1: Write the failing test** — append to `src/lib/operators/trajectory.test.ts`. Add `parseSubmarketCount` to the existing import from `./trajectory`, then:

```ts
test("parseSubmarketCount counts a JSON array and tolerates null/garbage", () => {
  assert.equal(parseSubmarketCount(JSON.stringify(["a", "b", "c"])), 3);
  assert.equal(parseSubmarketCount(JSON.stringify([])), 0);
  assert.equal(parseSubmarketCount(null), null);
  assert.equal(parseSubmarketCount("not json"), null);
  assert.equal(parseSubmarketCount(JSON.stringify({ a: 1 })), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:watch-list`
Expected: FAIL — `parseSubmarketCount` is not exported.

- [ ] **Step 3: Implement.** In `src/lib/operators/trajectory.ts`:

Add the parse helper (place it just above `loadOperatorTrajectory`):
```ts
/** Count of distinct submarkets in the stored `topSubmarkets` JSON array
 *  (geographic-reach proxy). null when absent or unparseable. */
export function parseSubmarketCount(topSubmarkets: string | null): number | null {
  if (!topSubmarkets) return null;
  try {
    const arr = JSON.parse(topSubmarkets);
    return Array.isArray(arr) ? arr.length : null;
  } catch {
    return null;
  }
}
```

Add to the `TrajectoryPoint` interface (after `eligible: boolean;`):
```ts
  /** Distinct submarkets with T12 listings that snapshot — geographic-reach
   *  proxy. Optional: only the per-operator loader populates it. */
  submarketCount?: number | null;
  /** Fraction (0..1) of T12 listings mentioning concessions that snapshot. */
  concessionRate?: number | null;
```

In `loadOperatorTrajectory`'s `select`, add:
```ts
      topSubmarkets: true,
      concessionRate: true,
```

In its `points: rows.map(...)` object, add:
```ts
      submarketCount: parseSubmarketCount(r.topSubmarkets),
      concessionRate: r.concessionRate,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:watch-list`
Expected: PASS (301 + 1). Also run `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/operators/trajectory.ts src/lib/operators/trajectory.test.ts
git commit -m "feat(scorecard): surface submarketCount + concessionRate on trajectory points"
```

---

### Task 2: Rent-tier module — pure value↔premium position

**Files:**
- Create: `src/lib/scorecard/rent-tier.ts`
- Test: `src/lib/scorecard/rent-tier.test.ts`

**Interfaces:**
- Produces: `latestRent(input: RentInput): number | null`; `rentTierPosition(focal: RentInput, pool: RentInput[]): number | null` returning a **0..1** position (matching `RentTierMarker`'s `position` prop). `interface RentInput { pm: { slug: string }; rentTrajectory?: Array<{ quarter: string; mixAdjMedian: number }> | null }`.
- Rationale: this is the pricing-tier math from `src/lib/lending-signals.ts` (`buildPricingTierSignal`/`latestRent`), re-homed as a pure module so the redesigned scorecard does not depend on the retiring Lending-Signals builder. Return 0..1 directly (the old code returned 0..100).

- [ ] **Step 1: Write the failing test** — create `src/lib/scorecard/rent-tier.test.ts`:

```ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { rentTierPosition, latestRent } from "./rent-tier";

const R = (slug: string, rent: number | null) => ({
  pm: { slug },
  rentTrajectory: rent == null ? [] : [{ quarter: "2025Q4", mixAdjMedian: rent, n: 10 }],
});

test("latestRent picks the most recent positive quarter, else null", () => {
  assert.equal(
    latestRent({ pm: { slug: "x" }, rentTrajectory: [
      { quarter: "2025Q1", mixAdjMedian: 1000, n: 1 },
      { quarter: "2025Q3", mixAdjMedian: 1200, n: 1 },
    ] }),
    1200
  );
  assert.equal(latestRent({ pm: { slug: "x" }, rentTrajectory: [] }), null);
});

test("focal at the top of the cohort → 1", () => {
  assert.equal(rentTierPosition(R("f", 3000), [R("a", 1000), R("b", 2000)]), 1);
});

test("focal at the bottom → 0", () => {
  assert.equal(rentTierPosition(R("f", 500), [R("a", 1000), R("b", 2000)]), 0);
});

test("focal in the middle → ~0.5", () => {
  const pos = rentTierPosition(R("f", 1500), [R("a", 1000), R("b", 2000)]);
  assert.ok(pos != null && pos > 0.3 && pos < 0.7);
});

test("no cohort or no focal rent → null", () => {
  assert.equal(rentTierPosition(R("f", 1500), []), null);
  assert.equal(rentTierPosition(R("f", null), [R("a", 1000)]), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:watch-list`
Expected: FAIL — `./rent-tier` does not exist.

- [ ] **Step 3: Implement.** Create `src/lib/scorecard/rent-tier.ts`:

```ts
// v0.24 — pure rent-tier position: the operator's most recent mix-adjusted
// median rent vs the MSA cohort distribution, as a 0..1 position on a
// value→premium track. Re-homed from the retiring lending-signals pricing
// tier so the redesigned scorecard has no dependency on that module.

export interface RentInput {
  pm: { slug: string };
  rentTrajectory?: Array<{ quarter: string; mixAdjMedian: number }> | null;
}

/** Most recent quarter's mix-adjusted median rent (>0), else null. */
export function latestRent(input: RentInput): number | null {
  const traj = input.rentTrajectory;
  if (!Array.isArray(traj) || traj.length === 0) return null;
  const sorted = [...traj].sort((a, b) => (b.quarter || "").localeCompare(a.quarter || ""));
  for (const q of sorted) {
    if (typeof q.mixAdjMedian === "number" && q.mixAdjMedian > 0) return q.mixAdjMedian;
  }
  return null;
}

/** 0..1 position of the focal operator's rent within its cohort (focal
 *  excluded by slug). null when focal has no rent or the cohort is empty. */
export function rentTierPosition(focal: RentInput, pool: RentInput[]): number | null {
  const operatorRent = latestRent(focal);
  if (operatorRent === null) return null;
  const cohortRents = pool
    .filter((p) => p.pm.slug !== focal.pm.slug)
    .map((p) => latestRent(p))
    .filter((v): v is number => v !== null);
  if (cohortRents.length === 0) return null;
  const all = [...cohortRents, operatorRent].sort((a, b) => a - b);
  const idx = all.indexOf(operatorRent);
  return all.length > 1 ? idx / (all.length - 1) : 0.5;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:watch-list` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/rent-tier.ts src/lib/scorecard/rent-tier.test.ts
git commit -m "feat(scorecard): pure rent-tier position module"
```

---

### Task 3: View-model — wire rent tier + reach/quality sparklines

**Files:**
- Modify: `src/lib/scorecard/view-model.ts`
- Test: `src/lib/scorecard/view-model.test.ts`

**Interfaces:**
- Consumes: `rentTierPosition` (Task 2); the widened `TrajectoryPoint` fields (Task 1).
- Produces: `BuildViewInput.trajectory.points` widened to the full superset the momentum + watch-item wiring needs (this single widening also serves Task 4). `scaleFit.rentTierPosition` now populated; `momentum.sparklines` `reach` and `quality` now carry real series; `share` stays `[]`.

- [ ] **Step 1: Write the failing test** — read `src/lib/scorecard/view-model.test.ts` first to find its input/fixture builder. Extend that builder so a test can pass (a) pool members with a `rentTrajectory`, and (b) trajectory points with `goldCount`/`silverCount`/`submarketCount`. Then add:

```ts
test("rent tier position is populated from operator rent vs pool", () => {
  // focal rent 2000 above pool [1000, 1500] → upper half
  const view = buildScorecardView(/* fixture: focal rentTrajectory latest 2000,
     pool members with latest rents 1000 and 1500 */);
  assert.ok(view.scaleFit.rentTierPosition != null && view.scaleFit.rentTierPosition > 0.5);
});

test("reach and quality sparklines populate from trajectory; share stays empty", () => {
  const view = buildScorecardView(/* fixture with trajectory points:
     [{portfolioPoint:100,goldCount:1,silverCount:1,submarketCount:3},
      {portfolioPoint:120,goldCount:2,silverCount:1,submarketCount:4},
      {portfolioPoint:140,goldCount:3,silverCount:1,submarketCount:6}] */);
  const spark = (k: string) => view.momentum.sparklines.find((s) => s.key === k)!;
  assert.deepEqual(spark("reach").series, [3, 4, 6]);
  assert.deepEqual(spark("quality").series, [3, 5, 7]); // gold*2 + silver
  assert.equal(spark("share").series.length, 0);
});
```

(If the existing fixture builder can't express pool rents / trajectory points, add optional params to it; keep existing tests passing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:watch-list`
Expected: FAIL — `rentTierPosition` still null; `reach`/`quality` series empty.

- [ ] **Step 3: Implement.** In `src/lib/scorecard/view-model.ts`:

Add import near the other `./` imports:
```ts
import { rentTierPosition } from "./rent-tier";
```

Widen `BuildViewInput.trajectory` to:
```ts
  trajectory: {
    points: Array<{
      portfolioPoint: number | null;
      goldCount?: number;
      silverCount?: number;
      submarketCount?: number | null;
      concessionRate?: number | null;
      eligible?: boolean;
      date?: string;
    }>;
  };
```

Hoist the pool cast to the top of `buildScorecardView` (just after `const { scorecard } = input;`) and reuse it (remove the later duplicate `const pool = input.pool as PoolMember[];`):
```ts
  const pool = input.pool as PoolMember[];
```

Replace `rentTierPosition: null, // ...` in the `scaleFit` object with:
```ts
    rentTierPosition: rentTierPosition(
      { pm: { slug: scorecard.pm.slug }, rentTrajectory: scorecard.rentTrajectory },
      pool.map((m) => ({ pm: { slug: m.slug }, rentTrajectory: m.scorecard.rentTrajectory }))
    ),
```

Just before the `momentum` object, add the two derived series:
```ts
  const reachSeries = (input.trajectory?.points ?? [])
    .map((p) => p.submarketCount)
    .filter((n): n is number => n != null);
  const qualitySeries = (input.trajectory?.points ?? [])
    .map((p) =>
      p.goldCount != null || p.silverCount != null
        ? (p.goldCount ?? 0) * 2 + (p.silverCount ?? 0)
        : null
    )
    .filter((n): n is number => n != null);
```

Update the sparklines array:
```ts
      mkSpark("portfolio", "Portfolio", portfolioSeries),
      mkSpark("share", "Listing share", []), // deferred: needs t12ListingsCount history (Phase 4b)
      mkSpark("reach", "Geographic reach", reachSeries),
      mkSpark("quality", "Operating quality", qualitySeries),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:watch-list` → PASS. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/view-model.ts src/lib/scorecard/view-model.test.ts
git commit -m "feat(scorecard): wire rent-tier + reach/quality momentum series into view-model"
```

---

### Task 4: Watch-items — concession-spike + rating/eligibility trend detectors

**Files:**
- Modify: `src/lib/scorecard/watch-items.ts` (new optional 3rd param + two detectors + a pure pair helper)
- Modify: `src/lib/scorecard/view-model.ts` (pass `input.trajectory` into `buildWatchItems`)
- Test: `src/lib/scorecard/watch-items.test.ts`

**Interfaces:**
- Consumes: the widened `BuildViewInput.trajectory` (Task 3).
- Produces: `buildWatchItems(scorecard, marketConcessionMedian, trajectory?: WatchTrajectory)` where
  `interface WatchTrajectoryPoint { date: string; concessionRate?: number | null; goldCount?: number; silverCount?: number; eligible?: boolean }` and `interface WatchTrajectory { points: WatchTrajectoryPoint[] }`.
- Both new detectors are guarded: no trajectory → no trend items (existing behavior preserved). The concession-spike is suppressed when the point-in-time "Heavy concession use" risk already fired (avoid double-flagging).

- [ ] **Step 1: Write the failing test** — append to `src/lib/scorecard/watch-items.test.ts`. Reuse the existing `sc()` helper; define a `quiet` overrides object that produces no point-in-time items (concessionRate 0, yearsVisible 6, low-vol below cohort, no concentration) and a `traj` helper:

```ts
const quiet = {
  concessionRate: 0.0,
  coverage: { yearsVisible: 6 },
  lendingSignals: {
    rentStability: { volatilityPP: 3.1, cohortMedianVolatility: 3.0, suppressed: false },
    geographicConcentration: { top3CityShare: 0.4, cohortMedianTop3: 0.6 },
  },
};
const traj = (points: any[]) => ({ points });

test("concession climbing sharply is a trend risk", () => {
  const items = buildWatchItems(sc({ concessionRate: 0.0 }), 0.5, traj([
    { date: "2024-06-30", concessionRate: 0.05 },
    { date: "2025-06-30", concessionRate: 0.20 },
  ]));
  assert.ok(items.some((i) => i.kind === "risk" && /climbing/i.test(i.headline)));
});

test("rating downgrade is a risk; improvement is positive", () => {
  const down = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 3, silverCount: 1 },
    { date: "2025-06-30", goldCount: 1, silverCount: 1 },
  ]));
  assert.ok(down.some((i) => i.kind === "risk" && /downgrade/i.test(i.headline)));
  const up = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", goldCount: 1, silverCount: 0 },
    { date: "2025-06-30", goldCount: 3, silverCount: 1 },
  ]));
  assert.ok(up.some((i) => i.kind === "positive" && /improvement/i.test(i.headline)));
});

test("dropped from rankings is a risk", () => {
  const items = buildWatchItems(sc(quiet), null, traj([
    { date: "2024-06-30", eligible: true, goldCount: 1, silverCount: 0 },
    { date: "2025-06-30", eligible: false, goldCount: 0, silverCount: 0 },
  ]));
  assert.ok(items.some((i) => i.kind === "risk" && /dropped/i.test(i.headline)));
});

test("no trajectory → no trend items (back-compat)", () => {
  const items = buildWatchItems(sc(), 0.01);
  assert.ok(items.every((i) => !/climbing|downgrade|dropped|improvement/i.test(i.headline)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:watch-list`
Expected: FAIL — 3rd arg not accepted / trend items absent.

- [ ] **Step 3: Implement.** In `src/lib/scorecard/watch-items.ts`:

Add types + constants near the top:
```ts
export interface WatchTrajectoryPoint {
  date: string;
  concessionRate?: number | null;
  goldCount?: number;
  silverCount?: number;
  eligible?: boolean;
}
export interface WatchTrajectory {
  points: WatchTrajectoryPoint[];
}

const MIN_GAP_DAYS = 80; // require ~a quarter between compared snapshots

function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Latest usable value + the newest earlier value at least minGapDays back. */
function trendPair(
  points: WatchTrajectoryPoint[],
  valueOf: (p: WatchTrajectoryPoint) => number | null,
  minGapDays = MIN_GAP_DAYS
): { prev: number; curr: number } | null {
  const usable = points.filter((p) => valueOf(p) != null && p.date);
  if (usable.length < 2) return null;
  const curr = usable[usable.length - 1];
  for (let i = usable.length - 2; i >= 0; i--) {
    if (daysBetween(usable[i].date, curr.date) >= minGapDays) {
      return { prev: valueOf(usable[i])!, curr: valueOf(curr)! };
    }
  }
  return null;
}
```

Change the signature:
```ts
export function buildWatchItems(
  scorecard: ScorecardData,
  marketConcessionMedian: number | null,
  trajectory?: WatchTrajectory
): WatchItem[] {
```

In the existing "Heavy concession use" block, capture whether it fired. Change its `if` to set a flag:
```ts
  let concessionLevelFired = false;
  const rate = scorecard.concessionRate ?? null;
  const mkt = marketConcessionMedian;
  if (rate != null && rate > 0 && mkt != null && rate >= Math.max(0.1, mkt * CONCESSION_RISK_MULTIPLE)) {
    concessionLevelFired = true;
    items.push({ /* ...unchanged... */ });
  }
```

Add the two trend detectors AFTER the existing point-in-time blocks and BEFORE the final `order`/`sort` return:
```ts
  // RISK (trend) — concessions climbing sharply quarter-over-quarter.
  // Suppressed when the level-based risk already fired above.
  if (trajectory && !concessionLevelFired) {
    const pair = trendPair(trajectory.points, (p) => p.concessionRate ?? null);
    if (pair && pair.curr >= Math.max(0.1, pair.prev * 2) && pair.curr - pair.prev >= 0.05) {
      items.push({
        kind: "risk",
        headline: "Concession use climbing",
        explanation: `Concessions rose from ${pct(pair.prev)} to ${pct(pair.curr)} of listings over recent quarters — a sharp increase.`,
        ask: "Is this a response to softening demand, or a deliberate leasing push?",
      });
    }
  }

  // RISK / POSITIVE (trend) — recent ranking or star movement.
  if (trajectory) {
    const pts = trajectory.points;
    const last = pts[pts.length - 1];
    const droppedOut = !!last && last.eligible === false && pts.some((p) => p.eligible === true);
    if (droppedOut) {
      items.push({
        kind: "risk",
        headline: "Recently dropped from rankings",
        explanation:
          "This operator met the ranking threshold in an earlier snapshot but no longer does — its recent listing volume has fallen below the eligibility floor.",
        ask: "Is the operator winding down, or did its listings simply move off-platform?",
      });
    } else {
      const pair = trendPair(pts, (p) =>
        p.goldCount != null || p.silverCount != null
          ? (p.goldCount ?? 0) * 2 + (p.silverCount ?? 0)
          : null
      );
      if (pair && pair.curr < pair.prev) {
        items.push({
          kind: "risk",
          headline: "Recent rating downgrade",
          explanation:
            "The operator's star rating has slipped versus an earlier snapshot — one or more metrics fell out of the top tiers.",
          ask: "Which operating metric weakened, and is the change durable or a one-quarter dip?",
        });
      } else if (pair && pair.curr > pair.prev) {
        items.push({
          kind: "positive",
          headline: "Recent rating improvement",
          explanation:
            "The operator's star rating has improved versus an earlier snapshot — operating metrics are trending into higher tiers.",
        });
      }
    }
  }
```

In `src/lib/scorecard/view-model.ts`, pass the trajectory (cast — the widened input point type has optional `date`, `WatchTrajectory` wants it required; the loader always sets it):
```ts
  const watchItems = buildWatchItems(
    scorecard,
    input.marketConcessionMedian,
    input.trajectory as unknown as import("./watch-items").WatchTrajectory | undefined
  );
```
(Or add `WatchTrajectory` to the existing `./watch-items` import and use it directly.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:watch-list` → PASS (all trend + back-compat tests). `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/watch-items.ts src/lib/scorecard/view-model.ts src/lib/scorecard/watch-items.test.ts
git commit -m "feat(scorecard): concession-spike + rating-change trend watch-items"
```

---

### Task 5: Dev-preview fixture + full verification

**Files:**
- Modify: `src/app/dev/scorecard-preview/page.tsx` (populate the new states in the fixture `ScorecardView`)

**Interfaces:**
- Consumes: everything above. No production code path change — the real page already passes `pool`, `trajectory`, and `marketConcessionMedian` (verified at `src/app/property-managers/[state]/[city]/[slug]/page.tsx`); the loader change flows through automatically, so `page.tsx` needs **no edit**.

- [ ] **Step 1: Update the fixture** so the new capabilities are visible in the dev preview. In `src/app/dev/scorecard-preview/page.tsx`'s fixture `ScorecardView`:
  - `scaleFit.rentTierPosition`: set to `0.72` (was `null`).
  - `momentum.sparklines`: give `reach` a rising series e.g. `[2, 3, 3, 4, 5]` with `direction: "growing"`, and `quality` e.g. `[4, 4, 5, 6, 7]` with `direction: "growing"`; leave `share` as `series: []`, `direction: "insufficient"`.
  - `watchItems`: add a concession-climbing **risk** (headline "Concession use climbing", an `ask`) and a **positive** "Recent rating improvement", keeping the existing items; keep them in `risk → data → context → positive` order.
  - Update the "Watch Items" readout row count if the fixture sets it literally.

- [ ] **Step 2: Full verification**

Run, in order:
```bash
npx tsc --noEmit          # expect 0 errors
npm run test:watch-list   # expect all pass
npm run build             # expect "Compiled successfully" + /dev/scorecard-preview in the route list
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dev/scorecard-preview/page.tsx
git commit -m "chore(scorecard): dev-preview fixture exercises rent-tier + reach/quality + trend watch-items"
```

- [ ] **Step 4 (controller, not implementer):** render `/dev/scorecard-preview` locally and screenshot the Scale & Fit (rent-tier marker filled), Momentum (reach + quality sparklines), and Watch Items (new trend items) sections to confirm the populated states, then bring them to Jonas.

---

## Self-Review

**Spec coverage** (redesign spec §Phase 4, Option-1 subset):
- Rent tier "value↔premium marker from operator median rent" → Task 2 + 3. ✅
- Momentum "Geographic reach" + "Operating quality" sparklines → Task 1 (data) + Task 3 (series). ✅
- Net-new Watch-Item detectors: concession-spike + rank/star change → Task 4. ✅
- Listing-share explicitly deferred (Phase 4b) → left empty, noted in code comment + Global Constraints. ✅
- Portfolio sparkline already live (Phase 3) — untouched. ✅

**Placeholder scan:** no TBD/TODO; every code step carries full code; tests carry real assertions. Task 3's test fixtures reference the existing view-model test builder (implementer extends it) — the assertions + expected values are exact.

**Type consistency:** `TrajectoryPoint.submarketCount?/concessionRate?` (Task 1, optional) match the `BuildViewInput.trajectory` superset (Task 3) and `WatchTrajectoryPoint` (Task 4). `rentTierPosition` returns 0..1 (Task 2) matching `RentTierMarker.position` 0..1 and `ScaleFitView.rentTierPosition: number | null`. `buildWatchItems` 3rd param optional preserves the 2-arg call sites.

**Constraint check:** no migration/seed/pipeline/backfill touched; quality sparkline stays line-only (MomentumSection unchanged); Listing-share deferred.
