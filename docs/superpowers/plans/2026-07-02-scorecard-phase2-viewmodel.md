# Scorecard Redesign — Phase 2: View-Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build `buildScorecardView()` — the pure function that assembles everything the redesigned scorecard components render (exec readout, Scale & Fit, Operating Performance rows, Momentum, Watch Items, peers) from the already-loaded `ScorecardData` + market pool + trajectory, using the Phase-1 derivation library.

**Architecture:** One new module `src/lib/scorecard/view-model.ts` exporting a `ScorecardView` type (the components' props contract) and `buildScorecardView(input)`. Pure — takes already-loaded data (no I/O), returns the view. Unit-tested with fixtures. The redesigned components (next plan) consume `ScorecardView` and never touch raw `ScorecardData` directly.

**Tech Stack:** TypeScript (strict), `node --import tsx --test` (the `test:watch-list` script already globs `src/lib/scorecard/*.test.ts`).

## Global Constraints

- **Never surface precise rank or the raw composite score.** The view carries labels, values-vs-benchmark, stars, percentiles-as-position (0–1), and directions — never `rank.overall` or the composite number.
- Reuse the Phase-1 library (`./labels`, `./momentum`, `./peers`, `./watch-items`) — do not re-derive labels or re-hardcode bands.
- Momentum series that have no history yet (listing-share, geo-reach, quality) resolve to `insufficient` via `momentumDirection` on an empty series — the view degrades gracefully; the pipeline phase fills them later.
- Inputs are already-loaded shapes from the existing loaders: `ScorecardData` (`@/lib/types`), `PoolPm[]` (`@/lib/msa-pool`), `OperatorTrajectory` (`@/lib/operators/trajectory`). Do not add DB/Prisma calls.
- DRY, YAGNI, TDD, frequent commits.

---

### Task 1: `ScorecardView` type + header/exec-readout assembly

**Files:**
- Create: `src/lib/scorecard/view-model.ts`
- Test: `src/lib/scorecard/view-model.test.ts`

**Interfaces:**
- Consumes: `ScorecardData` (`@/lib/types`); `countOperatorStars` (`@/lib/operators/stars`); `operatingPerformanceLabel`, `type ScoreLabel` (`./labels`).
- Produces:
  - `interface ScorecardView { header: HeaderView; readout: ReadoutRow[]; /* extended in later tasks */ }`
  - `interface HeaderView { name: string; quadrant7Cell: string | null; marketFullName: string; singleMarket: boolean; goldCount: number; silverCount: number; dwellsyCompanyUrl: string | null; website: string | null; }`
  - `interface ReadoutRow { area: "Scale & Fit" | "Operating Performance" | "Momentum" | "Watch Items"; value: string; label?: ScoreLabel | string; }`
  - `interface BuildViewInput { scorecard: ScorecardData; pool: unknown[]; trajectory: unknown; marketConcessionMedian: number | null; }`
  - `buildScorecardView(input: BuildViewInput): ScorecardView`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scorecard/view-model.test.ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { buildScorecardView } from "./view-model";
import type { ScorecardData } from "@/lib/types";

function scFixture(over: any = {}): ScorecardData {
  return {
    pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent",
          companyId: "191930", website: "https://doorby.com", ...(over.pm ?? {}) },
    market: { id: "chattanooga-tn", name: "Chattanooga", state: "TN", fullName: "Chattanooga MSA" },
    rank: { percentiles: { dom: 66, tenancy: 82, rentPerformance: 48, marketing: 70, communityVisibility: null },
            percentilesMulti: { composite: { primary: 68, msa: 62 } }, compositeCohortUsedForStar: "primary" },
    performance: { domStar: "silver" }, tenancy: { star: "gold" }, rentPerformance: { star: null },
    marketing: { star: "silver" }, communityVisibility: { star: null },
    ...over,
  } as unknown as ScorecardData;
}

test("header carries name, star counts, and both links (companyId + website)", () => {
  const v = buildScorecardView({ scorecard: scFixture(), pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 });
  assert.equal(v.header.name, "Doorby");
  assert.equal(v.header.dwellsyCompanyUrl, "https://dwellsy.com/company/191930");
  assert.equal(v.header.website, "https://doorby.com");
  assert.equal(v.header.singleMarket, true);
  assert.equal(typeof v.header.goldCount, "number");
});

test("header dwellsyCompanyUrl is null when companyId missing", () => {
  const v = buildScorecardView({ scorecard: scFixture({ pm: { companyId: null, name: "X", slug: "x", quadrant7Cell: "SFR Independent" } }), pool: [], trajectory: { points: [] }, marketConcessionMedian: null });
  assert.equal(v.header.dwellsyCompanyUrl, null);
});

test("readout has the four areas with the Operating Performance label", () => {
  const v = buildScorecardView({ scorecard: scFixture(), pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 });
  const areas = v.readout.map((r) => r.area);
  assert.deepEqual(areas, ["Scale & Fit", "Operating Performance", "Momentum", "Watch Items"]);
  const op = v.readout.find((r) => r.area === "Operating Performance");
  assert.equal(op!.label, "good"); // composite primary 68 -> good
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/view-model.test.ts`
Expected: FAIL — cannot find module `./view-model`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/scorecard/view-model.ts
// v0.24 — assembles the redesigned scorecard's view model from already-loaded
// data + the Phase-1 derivation library. Pure; no I/O. Components consume
// ScorecardView and never touch raw ScorecardData. Never surfaces raw
// rank/composite — only labels, values-vs-benchmark, stars, positions.

import type { ScorecardData } from "@/lib/types";
import { countOperatorStars } from "@/lib/operators/stars";
import { operatingPerformanceLabel, type ScoreLabel } from "./labels";

export interface HeaderView {
  name: string;
  quadrant7Cell: string | null;
  marketFullName: string;
  singleMarket: boolean;
  goldCount: number;
  silverCount: number;
  dwellsyCompanyUrl: string | null;
  website: string | null;
}

export interface ReadoutRow {
  area: "Scale & Fit" | "Operating Performance" | "Momentum" | "Watch Items";
  value: string;
  label?: ScoreLabel | string;
}

export interface ScorecardView {
  header: HeaderView;
  readout: ReadoutRow[];
}

export interface BuildViewInput {
  scorecard: ScorecardData;
  pool: unknown[];
  trajectory: { points: Array<{ portfolioPoint: number | null }> };
  marketConcessionMedian: number | null;
}

export function buildScorecardView(input: BuildViewInput): ScorecardView {
  const { scorecard } = input;
  const { goldCount, silverCount } = countOperatorStars(scorecard);
  const companyId = scorecard.pm.companyId ?? null;

  const header: HeaderView = {
    name: scorecard.pm.name,
    quadrant7Cell: scorecard.pm.quadrant7Cell ?? null,
    marketFullName: scorecard.market.fullName,
    singleMarket:
      !scorecard.canonicalOperatorId ||
      scorecard.canonicalOperatorId === scorecard.pm.slug,
    goldCount,
    silverCount,
    dwellsyCompanyUrl: companyId ? `https://dwellsy.com/company/${companyId}` : null,
    website: scorecard.pm.website ?? null,
  };

  const opLabel = operatingPerformanceLabel(scorecard);

  // Placeholder value strings are filled by later tasks (scale/momentum/watch).
  const readout: ReadoutRow[] = [
    { area: "Scale & Fit", value: "" },
    { area: "Operating Performance", value: "", label: opLabel },
    { area: "Momentum", value: "" },
    { area: "Watch Items", value: "" },
  ];

  return { header, readout };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/view-model.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/view-model.ts src/lib/scorecard/view-model.test.ts
git commit -m "feat(scorecard): view-model skeleton — header + exec readout"
```

---

### Task 2: Scale & Fit block

**Files:**
- Modify: `src/lib/scorecard/view-model.ts`, `src/lib/scorecard/view-model.test.ts`

**Interfaces:**
- Consumes (from `ScorecardData`): `portfolioEstimate.{point,low,high,confidence,status}`, `coverage.urusT12`, `geographicCoverage.{topCities,coverageMapPoints}`, `lendingSignals.geographicConcentration.{top3CityShare,cohortMedianTop3}`, `coverage.citiesObserved`.
- Produces: `interface ScaleFitView { takeaway: string; observedUnits: number | null; estimate: { point: number | null; low: number | null; high: number | null; confidence: string | null; status: string }; topCities: Array<{ name: string; pct: number }>; top3Share: number | null; cohortTop3: number | null; rentTierPosition: number | null; propertyType: string | null; citiesObserved: number | null; singleMarket: boolean; }`. Add `scaleFit: ScaleFitView` to `ScorecardView`. Also fill the "Scale & Fit" `ReadoutRow.value` with a one-line summary (e.g. `Mid-sized … ~644 est. units · Medium confidence`).

- [ ] **Step 1: Write the failing test**

```ts
// add to view-model.test.ts
test("scaleFit surfaces estimate band + confidence + observed units, and fills the readout", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      portfolioEstimate: { status: "estimated", point: 644, low: 410, high: 870, confidence: "Medium" },
      coverage: { urusT12: 318, citiesObserved: 3 },
      geographicCoverage: { topCities: [{ name: "Chattanooga", pct: 0.52 }], coverageMapPoints: [] },
      lendingSignals: { geographicConcentration: { top3CityShare: 0.84, cohortMedianTop3: 0.61 } },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01,
  });
  assert.equal(v.scaleFit.estimate.point, 644);
  assert.equal(v.scaleFit.estimate.confidence, "Medium");
  assert.equal(v.scaleFit.observedUnits, 318);
  assert.equal(v.scaleFit.top3Share, 0.84);
  const row = v.readout.find((r) => r.area === "Scale & Fit")!;
  assert.match(row.value, /644/);
  assert.match(row.value, /Medium/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/view-model.test.ts`
Expected: FAIL — `v.scaleFit` undefined.

- [ ] **Step 3: Implement**

```ts
// add to view-model.ts (types + build logic)
export interface ScaleFitView {
  takeaway: string;
  observedUnits: number | null;
  estimate: { point: number | null; low: number | null; high: number | null; confidence: string | null; status: string };
  topCities: Array<{ name: string; pct: number }>;
  top3Share: number | null;
  cohortTop3: number | null;
  propertyType: string | null;
  citiesObserved: number | null;
  singleMarket: boolean;
}

// inside buildScorecardView, before `return`:
const pe = scorecard.portfolioEstimate;
const geo = scorecard.geographicCoverage;
const conc = scorecard.lendingSignals?.geographicConcentration;
const scaleFit: ScaleFitView = {
  takeaway: buildScaleFitTakeaway(scorecard),
  observedUnits: scorecard.coverage?.urusT12 ?? null,
  estimate: {
    point: pe?.point ?? null, low: pe?.low ?? null, high: pe?.high ?? null,
    confidence: pe?.confidence ?? null, status: pe?.status ?? "estimated",
  },
  topCities: geo?.topCities ?? [],
  top3Share: conc?.top3CityShare ?? null,
  cohortTop3: conc?.cohortMedianTop3 ?? null,
  propertyType: scorecard.pm.quadrant7Cell ?? null,
  citiesObserved: scorecard.coverage?.citiesObserved ?? null,
  singleMarket: header.singleMarket,
};

// helper (module scope):
function buildScaleFitTakeaway(sc: ScorecardData): string {
  const type = sc.pm.quadrant7Cell ?? "operator";
  return `${sc.pm.name} operates in ${sc.market.fullName} as a ${type}.`;
}
```
Add `scaleFit` to the returned `ScorecardView` and set the Scale & Fit readout row value:
```ts
readout[0].value = pe?.point != null
  ? `~${pe.point} est. units · ${pe.confidence ?? "unrated"} confidence`
  : (pe?.message ?? "Portfolio size not estimated");
```
Update the `ScorecardView` interface to include `scaleFit: ScaleFitView`.

- [ ] **Step 4: Run tests → PASS**

Run: `node --import tsx --test src/lib/scorecard/view-model.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/view-model.ts src/lib/scorecard/view-model.test.ts
git commit -m "feat(scorecard): view-model Scale & Fit block"
```

---

### Task 3: Operating Performance rows

**Files:** Modify `view-model.ts` + `view-model.test.ts`

**Interfaces:**
- Consumes: `metricLabels`, `strongestAndWatch`, `MetricKey` (`./labels`); `ScorecardData` fields — `rank.percentiles.<metric>`, `performance.{domT12,marketDomT12,houseDomT12,aptDomT12}`, `tenancy.{multiEpisodePct}`, `rentPerformance.{pmYoyChange,cohortMedianYoyChange}`, `marketing.compositeScore`, and per-metric stars.
- Produces: `interface MetricRow { key: MetricKey; title: string; label: ScoreLabel; value: string; benchmark: string; position: number | null; star: "gold" | "silver" | null; sub: string[]; }` and `interface OperatingView { sectionLabel: ScoreLabel; strongest: string[]; watch: string[]; metrics: MetricRow[]; }`. Add `operating: OperatingView`. Fill Operating Performance readout value (e.g. `Above cohort median on N of M scored dimensions`). `position` = percentile/100 (0–1) for the position bar; null when percentile null. Titles: dom→"Lease-up speed", tenancy→"Tenant retention", rentPerformance→"Rent performance", marketing→"Marketing discipline", communityVisibility→"Inventory transparency". Only include a metric row when its percentile is non-null OR its star is set (so SFR operators omit Inventory transparency).

- [ ] **Step 1: failing test**

```ts
// add to view-model.test.ts
test("operating rows carry label/value/position/star and drop null-percentile metrics", () => {
  const v = buildScorecardView({
    scorecard: scFixture({
      performance: { domT12: 18, marketDomT12: 31, houseDomT12: 16, aptDomT12: 22, domStar: "silver" },
      rentPerformance: { pmYoyChange: 0.031, cohortMedianYoyChange: 0.028, star: null },
      marketing: { compositeScore: 88, star: "silver" },
      tenancy: { multiEpisodePct: 0.31, star: "gold" },
    }),
    pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01,
  });
  const keys = v.operating.metrics.map((m) => m.key);
  assert.ok(keys.includes("dom"));
  assert.ok(!keys.includes("communityVisibility")); // null percentile + null star -> dropped
  const dom = v.operating.metrics.find((m) => m.key === "dom")!;
  assert.equal(dom.label, "good");        // 66th
  assert.equal(dom.position, 0.66);
  assert.equal(dom.star, "silver");
  assert.equal(v.operating.sectionLabel, "good"); // composite 68
});
```

- [ ] **Step 2: run → fail.** `node --import tsx --test src/lib/scorecard/view-model.test.ts`

- [ ] **Step 3: implement**

```ts
// add to view-model.ts
import { metricLabels, strongestAndWatch, type MetricKey } from "./labels";

const METRIC_TITLES: Record<MetricKey, string> = {
  dom: "Lease-up speed", tenancy: "Tenant retention", rentPerformance: "Rent performance",
  marketing: "Marketing discipline", communityVisibility: "Inventory transparency",
};

export interface MetricRow {
  key: MetricKey; title: string; label: ScoreLabel; value: string; benchmark: string;
  position: number | null; star: "gold" | "silver" | null; sub: string[];
}
export interface OperatingView {
  sectionLabel: ScoreLabel; strongest: string[]; watch: string[]; metrics: MetricRow[];
}

function metricStar(sc: ScorecardData, k: MetricKey): "gold" | "silver" | null {
  const s = k === "dom" ? sc.performance?.domStar
    : k === "tenancy" ? sc.tenancy?.star
    : k === "rentPerformance" ? sc.rentPerformance?.star
    : k === "marketing" ? sc.marketing?.star
    : sc.communityVisibility?.star;
  return s === "gold" || s === "silver" ? s : null;
}

function metricValueBenchmark(sc: ScorecardData, k: MetricKey): { value: string; benchmark: string; sub: string[] } {
  if (k === "dom") return {
    value: sc.performance?.domT12 != null ? `${Math.round(sc.performance.domT12)}d` : "—",
    benchmark: sc.performance?.marketDomT12 != null ? `market avg ${Math.round(sc.performance.marketDomT12)}d` : "",
    sub: [sc.performance?.houseDomT12 != null ? `Houses ${Math.round(sc.performance.houseDomT12)}d` : "",
          sc.performance?.aptDomT12 != null ? `Apartments ${Math.round(sc.performance.aptDomT12)}d` : ""].filter(Boolean),
  };
  if (k === "rentPerformance") return {
    value: sc.rentPerformance?.pmYoyChange != null ? `${(sc.rentPerformance.pmYoyChange * 100).toFixed(1)}%` : "—",
    benchmark: sc.rentPerformance?.cohortMedianYoyChange != null ? `cohort ${(sc.rentPerformance.cohortMedianYoyChange * 100).toFixed(1)}%` : "",
    sub: [],
  };
  if (k === "marketing") return {
    value: sc.marketing?.compositeScore != null ? String(Math.round(sc.marketing.compositeScore)) : "—",
    benchmark: "quality / 100", sub: [],
  };
  if (k === "tenancy") return {
    value: sc.tenancy?.multiEpisodePct != null ? `${Math.round(sc.tenancy.multiEpisodePct * 100)}%` : "—",
    benchmark: "re-list rate (lower = stickier)", sub: [],
  };
  return { value: "—", benchmark: "", sub: [] };
}

// inside buildScorecardView:
const labels = metricLabels(scorecard);
const sw = strongestAndWatch(scorecard);
const metricKeys: MetricKey[] = ["dom", "tenancy", "rentPerformance", "marketing", "communityVisibility"];
const pcts = scorecard.rank?.percentiles ?? ({} as Record<MetricKey, number | null>);
const metrics: MetricRow[] = metricKeys
  .filter((k) => pcts[k] != null || metricStar(scorecard, k) != null)
  .map((k) => {
    const vb = metricValueBenchmark(scorecard, k);
    return { key: k, title: METRIC_TITLES[k], label: labels[k], value: vb.value,
      benchmark: vb.benchmark, position: pcts[k] != null ? pcts[k]! / 100 : null,
      star: metricStar(scorecard, k), sub: vb.sub };
  });
const operating: OperatingView = {
  sectionLabel: opLabel, strongest: sw.strongest.map((k) => METRIC_TITLES[k]),
  watch: sw.watch.map((k) => METRIC_TITLES[k]), metrics,
};
const aboveCount = metrics.filter((m) => m.label === "strong" || m.label === "good").length;
readout[1].value = `Above cohort median on ${aboveCount} of ${metrics.length} scored dimensions`;
```
Add `operating: OperatingView` to `ScorecardView`.

- [ ] **Step 4: run → PASS.** **Step 5: commit** `feat(scorecard): view-model Operating Performance rows`

---

### Task 4: Momentum block (graceful when history absent)

**Files:** Modify `view-model.ts` + `view-model.test.ts`

**Interfaces:**
- Consumes: `momentumDirection`, `type MomentumSeries`, `type MomentumDirection` (`./momentum`); `OperatorTrajectory` (`trajectory.points[].portfolioPoint`); `scorecard.rentTrajectory`.
- Produces: `interface MomentumView { direction: MomentumDirection; takeaway: string; sparklines: Array<{ key: "portfolio" | "share" | "reach" | "quality"; label: string; direction: MomentumDirection; series: number[] }>; }`. Add `momentum: MomentumView`. Portfolio series comes from `trajectory.points` (non-null `portfolioPoint`); share/reach/quality series are empty for now → `momentumDirection([])` → `insufficient` (pipeline phase fills them). Section `direction` = the portfolio direction. Fill Momentum readout value from the direction.

- [ ] **Step 1: failing test**

```ts
// add to view-model.test.ts
test("momentum classifies portfolio from trajectory; other series insufficient for now", () => {
  const v = buildScorecardView({
    scorecard: scFixture({ rentTrajectory: [] }),
    pool: [],
    trajectory: { points: [
      { portfolioPoint: 100 }, { portfolioPoint: 110 }, { portfolioPoint: 120 }, { portfolioPoint: 135 },
    ] },
    marketConcessionMedian: 0.01,
  });
  const portfolio = v.momentum.sparklines.find((s) => s.key === "portfolio")!;
  assert.equal(portfolio.direction, "growing");
  assert.deepEqual(portfolio.series, [100, 110, 120, 135]);
  const reach = v.momentum.sparklines.find((s) => s.key === "reach")!;
  assert.equal(reach.direction, "insufficient"); // no history yet
  assert.equal(v.momentum.direction, "growing");
});
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement**

```ts
// add to view-model.ts
import { momentumDirection, type MomentumDirection } from "./momentum";

export interface MomentumView {
  direction: MomentumDirection;
  takeaway: string;
  sparklines: Array<{ key: "portfolio" | "share" | "reach" | "quality"; label: string; direction: MomentumDirection; series: number[] }>;
}

// inside buildScorecardView:
const portfolioSeries = (input.trajectory?.points ?? [])
  .map((p) => p.portfolioPoint)
  .filter((n): n is number => n != null);
const portfolioDir = momentumDirection({ values: portfolioSeries });
const mkSpark = (key: "portfolio" | "share" | "reach" | "quality", label: string, series: number[]) =>
  ({ key, label, series, direction: momentumDirection({ values: series }) });
const momentum: MomentumView = {
  direction: portfolioDir,
  takeaway: momentumTakeaway(scorecard.pm.name, portfolioDir),
  sparklines: [
    mkSpark("portfolio", "Portfolio", portfolioSeries),
    mkSpark("share", "Listing share", []),   // filled by pipeline phase
    mkSpark("reach", "Geographic reach", []), // filled by pipeline phase
    mkSpark("quality", "Operating quality", []), // filled by pipeline phase
  ],
};
readout[2].value = momentumReadout(portfolioDir);

// helpers (module scope):
function momentumTakeaway(name: string, dir: MomentumDirection): string {
  if (dir === "insufficient") return `Not enough history yet to read ${name}'s trajectory.`;
  if (dir === "volatile") return `${name}'s recent estimates are volatile — interpret recent moves cautiously.`;
  return `${name} appears ${dir === "growing" ? "larger" : dir === "declining" ? "smaller" : "steady"} versus when first observed.`;
}
function momentumReadout(dir: MomentumDirection): string {
  return dir === "insufficient" ? "Building history" : dir[0].toUpperCase() + dir.slice(1);
}
```
Add `momentum: MomentumView` to `ScorecardView`.

- [ ] **Step 4: run → PASS.** **Step 5: commit** `feat(scorecard): view-model Momentum block (graceful no-history)`

---

### Task 5: Watch Items + Similar-local-players, wire the full view

**Files:** Modify `view-model.ts` + `view-model.test.ts`

**Interfaces:**
- Consumes: `buildWatchItems`, `type WatchItem` (`./watch-items`); `selectSimilarLocalPlayers`, `type PeerCandidate`, `type SelectedPeer` (`./peers`); `operatingPerformanceLabel` for each pool member's label; the `PoolPm` shape from `@/lib/msa-pool` (`slug`, `name`, `quadrant7Cell`, `scorecard`).
- Produces: add `watchItems: WatchItem[]` and `peers: SelectedPeer[]` to `ScorecardView`. Fill the Watch Items readout value (count of non-positive items). Build `PeerCandidate[]` from the pool: `{ slug, name, quadrant7Cell, estimatedUnits: member.scorecard.portfolioEstimate?.point ?? null, operatingLabel: operatingPerformanceLabel(member.scorecard) }`, then `selectSimilarLocalPlayers(focalSlug, candidates, { limit: 4 })`.

- [ ] **Step 1: failing test**

```ts
// add to view-model.test.ts
test("watch items + peers assembled; readout shows non-positive count", () => {
  const poolMember = (slug: string, name: string, units: number) => ({
    slug, name, quadrant7Cell: "SFR Independent",
    scorecard: scFixture({ pm: { slug, name, quadrant7Cell: "SFR Independent" },
      portfolioEstimate: { status: "estimated", point: units },
      rank: { percentilesMulti: { composite: { msa: 55 } }, compositeCohortUsedForStar: "msa", percentiles: {} } }),
  });
  const v = buildScorecardView({
    scorecard: scFixture({
      pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent", companyId: "1" },
      concessionRate: 0.48, coverage: { yearsVisible: 2.3 },
      lendingSignals: { geographicConcentration: { top3CityShare: 0.84, cohortMedianTop3: 0.61 },
                        rentStability: { volatilityPP: 1.1, cohortMedianVolatility: 3.0, suppressed: false } },
      portfolioEstimate: { status: "estimated", point: 644 },
    }),
    pool: [
      { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent",
        scorecard: scFixture({ pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent" }, portfolioEstimate: { status: "estimated", point: 644 } }) },
      poolMember("river", "River City Homes", 720),
      poolMember("volunteer", "Volunteer PM", 520),
    ],
    trajectory: { points: [] }, marketConcessionMedian: 0.01,
  });
  assert.ok(v.watchItems.length >= 1 && v.watchItems[0].kind === "risk");
  assert.ok(v.peers.some((p) => p.isFocal && p.slug === "doorby-chattanooga-tn"));
  assert.ok(v.peers.some((p) => p.slug === "river"));
  const wr = v.readout.find((r) => r.area === "Watch Items")!;
  assert.match(wr.value, /\d/); // has a count
});
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement**

```ts
// add to view-model.ts
import { buildWatchItems, type WatchItem } from "./watch-items";
import { selectSimilarLocalPlayers, type PeerCandidate, type SelectedPeer } from "./peers";

interface PoolMember { slug: string; name: string; quadrant7Cell: string | null; scorecard: ScorecardData }

// inside buildScorecardView (input.pool is PoolMember[]):
const pool = input.pool as PoolMember[];
const watchItems = buildWatchItems(scorecard, input.marketConcessionMedian);
const candidates: PeerCandidate[] = pool.map((m) => ({
  slug: m.slug, name: m.name, quadrant7Cell: m.quadrant7Cell,
  estimatedUnits: m.scorecard.portfolioEstimate?.point ?? null,
  operatingLabel: operatingPerformanceLabel(m.scorecard),
}));
const peers = selectSimilarLocalPlayers(scorecard.pm.slug, candidates, { limit: 4 });
const nonPositive = watchItems.filter((w) => w.kind !== "positive").length;
readout[3].value = nonPositive > 0
  ? `${nonPositive} to review${watchItems.length > nonPositive ? " · 1+ positive" : ""}`
  : (watchItems.length > 0 ? "positives only" : "none");
```
Add `watchItems: WatchItem[]` and `peers: SelectedPeer[]` to `ScorecardView` and the return.

- [ ] **Step 4: run full suite + tsc**

Run: `npm run test:watch-list && npx tsc --noEmit`
Expected: all pass, tsc exit 0.

- [ ] **Step 5: commit**

```bash
git add src/lib/scorecard/view-model.ts src/lib/scorecard/view-model.test.ts
git commit -m "feat(scorecard): view-model Watch Items + peers; full view assembled"
```

---

## Self-Review

**Spec coverage (view-model scope):** header (name/stars/links) ✓ T1; exec readout labels ✓ T1–T5; Scale & Fit (estimate band + confidence + observed + geography + concentration) ✓ T2; Operating Performance rows (label/value/benchmark/position/star/sub) ✓ T3; Momentum (portfolio from trajectory; others graceful-insufficient) ✓ T4; Watch Items + similar-local-players ✓ T5. Deferred (correctly): the actual rendering (components plan, next); the non-portfolio momentum series data (pipeline phase).

**Placeholder scan:** none — each step has complete code; readout `value`s are progressively filled (T1 sets empty, T2–T5 populate) which is intentional incremental construction, not a placeholder.

**Type consistency:** `ScoreLabel`/`MetricKey` reused from `./labels`; `MomentumSeries`/`MomentumDirection` from `./momentum`; `WatchItem` from `./watch-items`; `PeerCandidate`/`SelectedPeer` from `./peers`. `ScorecardView` is extended additively across tasks (header/readout → scaleFit → operating → momentum → watchItems/peers). The `BuildViewInput.pool`/`trajectory` are typed loosely in T1 then narrowed via local casts (`PoolMember[]`) in T5 — acceptable for an incremental build; the components plan will pass the real `PoolPm[]`/`OperatorTrajectory`.

**Note for the components plan:** components import `ScorecardView` + its sub-view types from this module and render them with `globals.css` tokens (navy/teal/grid/good/etc.). The page wires `buildScorecardView({ scorecard, pool: msaPool, trajectory: operatorTrajectory, marketConcessionMedian })` where `marketConcessionMedian` comes from `concessionContext`/the msaPool.
