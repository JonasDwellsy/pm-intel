# Scorecard Re-Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Re-home six data points the redesign dropped — vacancy/turnover, rent stability, operator tenure & markets, concession detail, apartment/house unit mix, and cross-market coverage — into the redesigned decision-area sections (Operating Performance, Scale & Fit, Momentum), reusing existing builders/loaders (no new pipeline or seed work).

**Architecture:** All six are re-wiring, not new computation. The retired logic still exists: `src/lib/lending-signals.ts` (`buildVacancySignal`, `buildRentStabilitySignal`, `buildOperatorStabilitySignal`), `src/lib/concession-context.ts` (`buildConcessionContext`, `uniquePatternLabels`, `formatConcessionSample`), `src/lib/operators/trajectory.ts` (`loadOperatorAggregateTrajectory`). We surface their output through NEW typed fields on `ScorecardView` and render them with the redesign's existing primitives (`MetricCard`/`PositionBar`/`LabelChip`/`Sparkline`). We do NOT resurrect the old `LendingSignals.tsx`/`OperatorTrajectorySection.tsx` component shells.

**Reference:** the data-availability map at `.superpowers/sdd/` (birmingham/re-enrichment investigation) — it has field names, real example values, and file:line for every builder. Implementers should read the named builder before wiring it.

**Tech Stack:** TypeScript, Next.js 16 App Router, Prisma (read), `node:test`/`node:assert` via `npm run test:watch-list`.

## Global Constraints

- **Never surface raw rank/composite.** These signals expose per-metric values + cohort-median comparisons + a star/label — never an operator rank or composite score. (The existing per-signal `star` fields are fine; they're per-metric.)
- **Facts-not-judgments voice.** Reframe as diligence/monitoring — NO "lending", "underwriting", "credit", "borrower" language in any user-facing copy (section titles, labels, tooltips). The reused builders are internal; their OUTPUT is fine, but any new copy must use diligence framing.
- **Reuse, don't resurrect.** Import the builder FUNCTIONS from `lending-signals.ts`/`concession-context.ts`/`trajectory.ts`; render with `src/components/scorecard/redesign/` primitives. Do NOT import or render `LendingSignals.tsx`, `OperatorTrajectorySection.tsx`, `PerformanceLayer.tsx`, `PortfolioLayer.tsx`.
- **No pipeline/seed/migration changes.** Every field already exists in `ScorecardData`, the seed, or Postgres.
- **Type-aware gating (from the prior refinement round):** unit-mix split renders only for SFR/hybrid (`showSplit`); communities stay MF/BTR-only; cross-market renders only when `!singleMarket`.
- **Test harness:** `npm run test:watch-list`; keep the whole suite green (currently 330).

## Shared view-model additions (defined here; tasks extend incrementally)

`src/lib/scorecard/view-model.ts` gains these interfaces/fields (each task adds the ones it needs):
- `OperatingView.vacancy: { pct: number; cohortMedianPct: number | null; star: "gold"|"silver"|null } | null`
- `OperatingView.rentStability: { volatilityPP: number | null; cohortMedianPP: number | null; suppressed: boolean; reason: string | null; star: "gold"|"silver"|null } | null`
- `OperatingView.concession: { ratePct: number; marketMedianPct: number | null; patterns: string[]; samples: string[] } | null`
- `ScaleFitView.tenure: { yearsVisible: number; marketCount: number; cohortMedianYears: number | null } | null`
- `ScaleFitView.unitMix: { houseUrus: number; aptUrus: number } | null` (null when not SFR/hybrid or split total 0)
- `ScaleFitView.crossMarket: { canonicalSlug: string; marketNames: string[] } | null` (null for single-market)
- `MomentumView.sparklines` gains a `"footprint"` entry (marketsPresent over time) for multi-market operators; `[]`/insufficient otherwise.
- `BuildViewInput` gains: `pool` is already `PoolMember[]`; add `aggregateTrajectory?: { points: Array<{ portfolioPoint: number | null; marketsPresent: number }> }` and `memberMarketNames?: string[]` and `marketCount?: number` (fed by page.tsx for multi-market operators).

---

### Task 1: View-model — vacancy, rent stability, operator tenure

**Files:**
- Modify: `src/lib/scorecard/view-model.ts`
- Test: `src/lib/scorecard/view-model.test.ts`

**Interfaces — Produces:** `OperatingView.vacancy`, `OperatingView.rentStability`, `ScaleFitView.tenure` (shapes above).

**Reuse (read these first for exact signatures):** `buildVacancySignal(focal, pool)`, `buildRentStabilitySignal(focal)`, `buildOperatorStabilitySignal(focal, pool, marketFootprintCount)` in `src/lib/lending-signals.ts`. They return objects with the numeric values + cohort medians + `star`. `focal`/`pool` are `PoolPm`-shaped (`{ slug, scorecard }`) — the view-model already casts `input.pool as PoolMember[]` (which has `.scorecard`), and builds a focal from `scorecard`.

- [ ] **Step 1: Write failing tests** in `view-model.test.ts` (extend the existing fixture builder / `makePool`):
```ts
test("operating view surfaces vacancy + rent stability from lending-signal builders", () => {
  const v = buildScorecardView(/* fixture: scorecard w/ performance.domT12, tenancy.overallGap, lendingSignals.rentStability;
     pool with a few members so cohort medians compute */);
  assert.ok(v.operating.vacancy != null && typeof v.operating.vacancy.pct === "number");
  assert.ok(v.operating.rentStability != null);
});
test("rent stability suppressed state carries the reason", () => {
  const v = buildScorecardView(/* fixture: lendingSignals.rentStability { suppressed:true, reason:"Insufficient observation history..." } */);
  assert.equal(v.operating.rentStability!.suppressed, true);
  assert.match(v.operating.rentStability!.reason!, /insufficient/i);
});
test("scaleFit tenure surfaces yearsVisible + marketCount", () => {
  const v = buildScorecardView(/* fixture: coverage.yearsVisible 4.77; marketCount input 1 */);
  assert.equal(v.scaleFit.tenure!.marketCount, 1);
  assert.ok(v.scaleFit.tenure!.yearsVisible > 0);
});
```
- [ ] **Step 2: Run — expect FAIL** (`npm run test:watch-list`).
- [ ] **Step 3: Implement** — import the three builders; build `focal = { slug: scorecard.pm.slug, scorecard }` and reuse the already-cast `pool` (as `PoolPm[]`); populate `operating.vacancy`, `operating.rentStability`, and `scaleFit.tenure` (marketCount from `input.marketCount ?? 1`, yearsVisible from `scorecard.coverage?.yearsVisible ?? scorecard.tenancy?.yearsVisible ?? null`). Map builder outputs to the shapes above; null-guard when a builder returns null. Do not multiply already-percentage fields (mirror the tenancy-% lesson — check each builder's units).
- [ ] **Step 4: Run — expect PASS**; `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `feat(scorecard): view-model wiring for vacancy, rent stability, operator tenure`

---

### Task 2: View-model — concession detail + apartment/house unit mix

**Files:**
- Modify: `src/lib/scorecard/view-model.ts`
- Test: `src/lib/scorecard/view-model.test.ts`

**Interfaces — Produces:** `OperatingView.concession`, `ScaleFitView.unitMix`.

**Reuse:** `buildConcessionContext(scorecard, pool)` + `uniquePatternLabels`/`humanizeConcessionPattern` + `formatConcessionSample` in `src/lib/concession-context.ts`. Unit-mix uses `scorecard.performance.houseUrusT12` / `aptUrusT12` (counts, already in seed).

- [ ] **Step 1: Write failing tests:**
```ts
test("concession detail surfaces rate, market median, patterns, samples", () => {
  const v = buildScorecardView(/* fixture: concessionRate 0.4, concessionPatterns ["move_in_special"], concessionSamples ["..."], pool for market median */);
  assert.ok(v.operating.concession != null);
  assert.equal(v.operating.concession!.patterns.length >= 1, true);
});
test("no concession object when operator has zero concessions", () => {
  const v = buildScorecardView(/* concessionRate 0, listingCount 0 */);
  assert.equal(v.operating.concession, null);
});
test("unit mix present for SFR/hybrid with a nonzero split; null for pure MF", () => {
  const sfr = buildScorecardView(/* quadrant7Cell SFR Independent, houseUrusT12 1035, aptUrusT12 258 */);
  assert.deepEqual({h:sfr.scaleFit.unitMix!.houseUrus, a:sfr.scaleFit.unitMix!.aptUrus}, {h:1035,a:258});
  const mf = buildScorecardView(/* Large MF/BTR, houseUrusT12 0, aptUrusT12 155 */);
  assert.equal(mf.scaleFit.unitMix, null);
});
```
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — `operating.concession` = null when `concessionRate` is 0/absent, else `{ ratePct: rate*100 (confirm scale), marketMedianPct, patterns: uniquePatternLabels(...), samples: concessionSamples.slice(0,3).map(formatConcessionSample) }` using `buildConcessionContext`'s market median. `scaleFit.unitMix` = null unless the operator is SFR or hybrid (derive from `quadrant7Cell`) AND `houseUrusT12 + aptUrusT12 > 0`; else `{ houseUrus, aptUrus }`.
- [ ] **Step 4: Run — expect PASS**; tsc 0.
- [ ] **Step 5: Commit** — `feat(scorecard): view-model wiring for concession detail + unit mix`

---

### Task 3: Cross-market aggregate — page loader + view-model

**Files:**
- Modify: `src/app/property-managers/[state]/[city]/[slug]/page.tsx`
- Modify: `src/lib/scorecard/view-model.ts`
- Test: `src/lib/scorecard/view-model.test.ts`

**Interfaces — Consumes:** `loadOperatorAggregateTrajectory(memberPmSlugs)` → `{ points: AggregateTrajectoryPoint[] }` (each point has `portfolioPoint`, `marketsPresent`) from `src/lib/operators/trajectory.ts`; member enumeration via `prisma.pM.findMany({ where: { canonicalOperatorId } , select: { slug, marketId } })` and market display names (the pattern in `src/lib/operators/lookup.ts`). **Produces:** `ScaleFitView.crossMarket` + a `"footprint"` sparkline on `MomentumView`.

- [ ] **Step 1: page.tsx wiring** — when `scorecard.canonicalOperatorId && scorecard.canonicalOperatorId !== scorecard.pm.slug` (multi-market), after loading the scorecard: query member PMs by `canonicalOperatorId` → collect `pmSlugs` + distinct market display names; `const aggregateTrajectory = await loadOperatorAggregateTrajectory(memberPmSlugs)`. Pass `aggregateTrajectory`, `memberMarketNames`, and `marketCount` (distinct market count) into `buildScorecardView`. For single-market operators pass none (defaults). Keep everything else unchanged.
- [ ] **Step 2: Write failing test** (pure view-model):
```ts
test("cross-market footprint sparkline + market list for multi-market operator", () => {
  const v = buildScorecardView(/* scorecard with canonicalOperatorId != slug, marketCount 3,
     memberMarketNames ["Charlotte","Baltimore","Chicago"],
     aggregateTrajectory.points [{portfolioPoint:100,marketsPresent:2},{...:110,mp:3},{...:120,mp:3}] */);
  assert.deepEqual(v.scaleFit.crossMarket!.marketNames, ["Charlotte","Baltimore","Chicago"]);
  const fp = v.momentum.sparklines.find(s => s.key === "footprint")!;
  assert.deepEqual(fp.series, [2,3,3]);
});
test("no crossMarket for single-market operator", () => {
  const v = buildScorecardView(/* canonicalOperatorId === slug */);
  assert.equal(v.scaleFit.crossMarket, null);
});
```
- [ ] **Step 3: Implement** view-model: add `"footprint"` to the `MomentumView.sparklines` key union + build its series from `input.aggregateTrajectory?.points.map(p => p.marketsPresent)`; set `scaleFit.crossMarket` from `input.memberMarketNames` + `scorecard.canonicalOperatorId` when multi-market, else null. Update `mkSpark` union + the sparklines array (footprint appended; renders only when non-empty — the component can hide empty).
- [ ] **Step 4: Run — expect PASS**; tsc 0.
- [ ] **Step 5: Commit** — `feat(scorecard): cross-market footprint (aggregate trajectory + member markets)`

---

### Task 4: Operating Performance section — vacancy, rent-stability, concession cards

**Files:**
- Modify: `src/components/scorecard/redesign/OperatingPerformanceSection.tsx`

**Interfaces — Consumes:** `view.operating.vacancy`, `.rentStability`, `.concession` (Tasks 1–2).

- [ ] **Step 1: Implement** — after the existing scored-metric cards, render (each only when its field is non-null, using the section's existing `MetricCard`/card markup + `PositionBar`/`LabelChip`):
  - **Vacancy signal** card: value `${pct}% of cycle`, benchmark `cohort median ${cohortMedianPct}%`, star.
  - **Rent stability** card: when `suppressed`, render the `reason` in the muted/italic caveat style; else value `${volatilityPP} pp YoY stdev`, benchmark `cohort median ${cohortMedianPP} pp`, star.
  - **Concession** card: value `${ratePct}% of listings`, benchmark `market median ${marketMedianPct}%`; render `patterns` as small chips; render up to 3 `samples` as a compact muted blockquote list. Facts-not-judgments copy.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` → 0; `npm run build` → compiles. (Component; visual verified at Task 6 render.)
- [ ] **Step 3: Commit** — `feat(scorecard): vacancy, rent-stability, concession cards in Operating Performance`

---

### Task 5: Scale & Fit + Momentum — tenure/markets, unit-mix bar, cross-market

**Files:**
- Modify: `src/components/scorecard/redesign/ScaleFitSection.tsx`
- Modify: `src/components/scorecard/redesign/MomentumSection.tsx`

**Interfaces — Consumes:** `view.scaleFit.tenure`, `.unitMix`, `.crossMarket` (Tasks 1–3); the `"footprint"` sparkline (Task 3).

- [ ] **Step 1: ScaleFitSection** — (a) in the at-a-glance strip, upgrade/添加 a **Tenure** stat (`${yearsVisible.toFixed(1)}y visible · ${marketCount} market(s)`) when `tenure` present; (b) add a **house/apartment stacked bar** (teal houses / orange apartments, % labels + "Houses · N urus" / "Apartments · N urus" legend) when `unitMix` present — port the visual from `PortfolioLayer.tsx`'s composition bar into the redesign style; (c) when `crossMarket` present, render a **member-markets chip list** ("Charlotte · Baltimore · Chicago +N more") linking to `/operators/${crossMarket.canonicalSlug}`.
- [ ] **Step 2: MomentumSection** — the `"footprint"` sparkline is already in `view.momentum.sparklines`; ensure the section renders it (label "Cross-market footprint") only when its series is non-empty; single-market operators (empty series) omit it or show the insufficient state consistent with the other cells.
- [ ] **Step 3: Verify** — tsc 0; build compiles.
- [ ] **Step 4: Commit** — `feat(scorecard): tenure/markets, unit-mix bar, cross-market footprint in Scale & Fit + Momentum`

---

### Task 6: Page wiring verification + dev fixture + full verification

**Files:**
- Modify: `src/app/dev/scorecard-preview/page.tsx`

- [ ] **Step 1: Dev fixture** — extend the fixture `ScorecardView` so the new states are visible: `operating.vacancy`, `.rentStability` (add one suppressed example too if easy), `.concession` (with patterns + a sample); `scaleFit.tenure`, `.unitMix` (Doorby is SFR-ish → show a split), `.crossMarket` (member markets); a `"footprint"` sparkline with a rising `marketsPresent` series.
- [ ] **Step 2: Full verification** — `npx tsc --noEmit` (0); `npm run test:watch-list` (all pass); `npm run build` (compiles; `/dev/scorecard-preview` in route list).
- [ ] **Step 3: Commit** — `chore(scorecard): dev-preview fixture exercises re-enriched fields`
- [ ] **Step 4 (controller, not implementer):** render `/dev/scorecards/<a multi-market operator>` (real data, e.g. a Tricon market) + the fixture; screenshot the new Operating Performance cards, Scale & Fit tenure/unit-mix/cross-market, and the footprint sparkline; bring to Jonas.

---

## Self-Review

**Spec coverage:** all six confirmed items map to tasks — vacancy/rent-stability/tenure (T1), concession/unit-mix (T2), cross-market (T3); rendering in T4 (Operating), T5 (Scale&Fit + Momentum); fixture+verify T6. ✅

**Placeholder scan:** test snippets use `/* fixture: ... */` comments for the fixture wiring (the exact assertions + expected values are concrete); implementers extend the existing `view-model.test.ts` builder — acceptable, matches prior phases. The reused builder signatures are referenced by name+file (implementers read them) rather than transcribed — deliberate (DRY; they're existing tested code).

**Type consistency:** the shared view-model field shapes are defined once above and consumed verbatim by T4/T5; `"footprint"` added to the sparkline key union in T3 before T5 renders it. `crossMarket`/`tenure`/`unitMix`/`vacancy`/`rentStability`/`concession` names consistent across tasks.

**Constraint check:** no new pipeline/seed; reuse builders (not shells); diligence framing (no lending copy); type-aware gating (unit-mix SFR/hybrid, cross-market multi-market only); no rank/composite.
