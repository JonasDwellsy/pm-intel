# Scorecard Redesign — Phase 1: Derivation Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-logic library that turns a `ScorecardData` (and a market's operator list) into the judgment labels, section roll-ups, momentum direction, similar-local-players peer set, and categorized Watch Items the redesigned scorecard renders.

**Architecture:** A new `src/lib/scorecard/` module of pure, side-effect-free functions, each unit-tested with fixtures. It defines the contracts (input/output types) that the later pipeline phase must satisfy and the later component phase will consume — so this is the foundation and can be built + merged before either. No React, no Prisma, no I/O.

**Tech Stack:** TypeScript (strict), `node --import tsx --test` runner (the repo's `test:watch-list` script), no new dependencies.

**Why this is Phase 1 of the redesign:** the spec's build order lists pipeline first, but the derivation contracts are what the pipeline produces *for* and the components consume *from*. Defining + testing them first (against fixtures) locks the interfaces, so the pipeline and components each build against a known, tested surface. Subsequent phases (pipeline/data, components, assembly) get their own plans once this lands.

## Global Constraints

- **Never surface precise rank or the raw composite score.** These functions return qualitative labels only; the composite percentile is consumed internally to derive a label and is never returned to the UI. (Spec: HARD constraint; see `scorecard-sharpening-pr1` memory.)
- **Label bands (verbatim):** Strong ≥ 75 · Good 50–74 · Neutral 25–49 · Watch < 25 · Insufficient Data when the percentile is null. Percentiles are pre-oriented so higher = better on every metric (consistent with the star logic in `src/lib/operators/stars.ts`).
- **Methodology version stays `v0.6.4`** (no scoring change; this is presentation logic).
- All new tests live under `src/lib/scorecard/` and must be picked up by `npm run test:watch-list`.
- DRY, YAGNI, TDD, frequent commits.

## File Structure

- `src/lib/scorecard/labels.ts` — `ScoreLabel` type; `scoreLabel()`, `metricLabels()`, `compositePercentile()`, `operatingPerformanceLabel()`, `strongestAndWatch()`.
- `src/lib/scorecard/momentum.ts` — `MomentumSeries` type; `MomentumDirection` type; `momentumDirection()`.
- `src/lib/scorecard/peers.ts` — `PeerCandidate` / `SelectedPeer` types; `selectSimilarLocalPlayers()`.
- `src/lib/scorecard/watch-items.ts` — `WatchItem` / `WatchItemKind` types; `buildWatchItems()`.
- Tests: `*.test.ts` alongside each.
- `package.json` — extend the `test:watch-list` glob to include `src/lib/scorecard/*.test.ts`.

---

### Task 1: `scoreLabel` band mapping + wire tests into the runner

**Files:**
- Create: `src/lib/scorecard/labels.ts`
- Test: `src/lib/scorecard/labels.test.ts`
- Modify: `package.json` (the `test:watch-list` script glob)

**Interfaces:**
- Produces: `type ScoreLabel = "strong" | "good" | "neutral" | "watch" | "insufficient"` and `scoreLabel(percentile: number | null | undefined): ScoreLabel`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scorecard/labels.test.ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { scoreLabel } from "./labels";

test("scoreLabel maps percentile bands (>=75/50/25) with boundaries", () => {
  assert.equal(scoreLabel(90), "strong");
  assert.equal(scoreLabel(75), "strong");   // boundary is inclusive
  assert.equal(scoreLabel(74.9), "good");
  assert.equal(scoreLabel(50), "good");
  assert.equal(scoreLabel(49.9), "neutral");
  assert.equal(scoreLabel(25), "neutral");
  assert.equal(scoreLabel(24.9), "watch");
  assert.equal(scoreLabel(0), "watch");
});

test("scoreLabel treats null/undefined as insufficient", () => {
  assert.equal(scoreLabel(null), "insufficient");
  assert.equal(scoreLabel(undefined), "insufficient");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/labels.test.ts`
Expected: FAIL — cannot find module `./labels`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/scorecard/labels.ts
// v0.24 — pure judgment-label derivation for the redesigned scorecard.
// Labels are qualitative ONLY; the underlying percentile/composite is used to
// derive them and is never returned for display (hard constraint: no precise
// rank/composite on the scorecard). Percentiles are pre-oriented so higher =
// better on every metric (same orientation as the star logic).

export type ScoreLabel = "strong" | "good" | "neutral" | "watch" | "insufficient";

/** Percentile → judgment label. Bands: Strong ≥75 · Good 50–74 · Neutral
 *  25–49 · Watch <25 · Insufficient when the percentile is null/undefined
 *  (cohort too small to score). */
export function scoreLabel(percentile: number | null | undefined): ScoreLabel {
  if (percentile == null) return "insufficient";
  if (percentile >= 75) return "strong";
  if (percentile >= 50) return "good";
  if (percentile >= 25) return "neutral";
  return "watch";
}
```

- [ ] **Step 4: Extend the test runner glob**

In `package.json`, change the `test:watch-list` script so the glob includes the new directory. Current value:

```
"test:watch-list": "node --import tsx --test src/lib/*.test.ts src/lib/watch-list/*.test.ts src/lib/operators/*.test.ts src/lib/auth/*.test.ts src/lib/styles/*.test.ts src/lib/ask-tools/*.test.ts",
```

New value (adds `src/lib/scorecard/*.test.ts`):

```
"test:watch-list": "node --import tsx --test src/lib/*.test.ts src/lib/scorecard/*.test.ts src/lib/watch-list/*.test.ts src/lib/operators/*.test.ts src/lib/auth/*.test.ts src/lib/styles/*.test.ts src/lib/ask-tools/*.test.ts",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:watch-list`
Expected: PASS, including the two new `scoreLabel` tests, and all pre-existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scorecard/labels.ts src/lib/scorecard/labels.test.ts package.json
git commit -m "feat(scorecard): scoreLabel percentile-band mapping + wire scorecard tests"
```

---

### Task 2: Per-metric labels + Operating-Performance section label

**Files:**
- Modify: `src/lib/scorecard/labels.ts`
- Test: `src/lib/scorecard/labels.test.ts`

**Interfaces:**
- Consumes: `ScorecardData` from `@/lib/types` (fields used: `rank.percentiles.{dom,tenancy,rentPerformance,marketing,communityVisibility}`, `rank.percentilesMulti.composite`, `rank.compositeCohortUsedForStar`).
- Produces:
  - `type MetricKey = "dom" | "tenancy" | "rentPerformance" | "marketing" | "communityVisibility"`
  - `metricLabels(scorecard: ScorecardData): Record<MetricKey, ScoreLabel>`
  - `compositePercentile(scorecard: ScorecardData): number | null`
  - `operatingPerformanceLabel(scorecard: ScorecardData): ScoreLabel`

- [ ] **Step 1: Write the failing test**

```ts
// add to src/lib/scorecard/labels.test.ts
import { metricLabels, operatingPerformanceLabel, compositePercentile } from "./labels";
import type { ScorecardData } from "@/lib/types";

// Minimal ScorecardData fixture — only the fields these functions read.
function fixture(overrides: any = {}): ScorecardData {
  return {
    rank: {
      percentiles: { dom: 80, tenancy: 55, rentPerformance: 20, marketing: null, communityVisibility: null },
      percentilesMulti: { composite: { primary: 68, primaryCohortN: 40, fallback: null, fallbackCohortN: null, msa: 62, msaCohortN: 120 } },
      compositeCohortUsedForStar: "primary",
      ...(overrides.rank ?? {}),
    },
    ...overrides,
  } as unknown as ScorecardData;
}

test("metricLabels maps each metric percentile to a label", () => {
  const m = metricLabels(fixture());
  assert.equal(m.dom, "strong");         // 80
  assert.equal(m.tenancy, "good");       // 55
  assert.equal(m.rentPerformance, "watch"); // 20
  assert.equal(m.marketing, "insufficient"); // null
  assert.equal(m.communityVisibility, "insufficient"); // null
});

test("compositePercentile reads the cohort level used for the star", () => {
  assert.equal(compositePercentile(fixture()), 68); // primary
  assert.equal(
    compositePercentile(fixture({ rank: { percentiles: {}, percentilesMulti: { composite: { primary: 68, msa: 62 } }, compositeCohortUsedForStar: "msa" } })),
    62
  );
});

test("operatingPerformanceLabel uses the composite percentile band", () => {
  assert.equal(operatingPerformanceLabel(fixture()), "good"); // 68 -> good
});

test("operatingPerformanceLabel is insufficient when no composite percentile", () => {
  assert.equal(
    operatingPerformanceLabel(fixture({ rank: { percentiles: {}, percentilesMulti: {}, compositeCohortUsedForStar: undefined } })),
    "insufficient"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/labels.test.ts`
Expected: FAIL — `metricLabels`/`operatingPerformanceLabel`/`compositePercentile` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to src/lib/scorecard/labels.ts
import type { ScorecardData, CohortLevel } from "@/lib/types";

export type MetricKey =
  | "dom" | "tenancy" | "rentPerformance" | "marketing" | "communityVisibility";

const METRIC_KEYS: MetricKey[] = [
  "dom", "tenancy", "rentPerformance", "marketing", "communityVisibility",
];

/** Per-metric judgment labels from the stored MSA-level percentiles. */
export function metricLabels(scorecard: ScorecardData): Record<MetricKey, ScoreLabel> {
  const p = scorecard.rank?.percentiles ?? ({} as Record<MetricKey, number | null>);
  const out = {} as Record<MetricKey, ScoreLabel>;
  for (const k of METRIC_KEYS) out[k] = scoreLabel(p[k]);
  return out;
}

/** The composite percentile at the cohort level that drove the composite star
 *  (primary → fallback → msa), or null when unavailable. Internal only — never
 *  rendered as a number. */
export function compositePercentile(scorecard: ScorecardData): number | null {
  const multi = scorecard.rank?.percentilesMulti?.composite;
  if (!multi) return null;
  const level: CohortLevel = scorecard.rank?.compositeCohortUsedForStar ?? "msa";
  return multi[level] ?? multi.msa ?? multi.primary ?? null;
}

/** Section-level Operating-Performance label — the internal composite
 *  percentile on the same bands. Number never shown. */
export function operatingPerformanceLabel(scorecard: ScorecardData): ScoreLabel {
  return scoreLabel(compositePercentile(scorecard));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/labels.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/labels.ts src/lib/scorecard/labels.test.ts
git commit -m "feat(scorecard): per-metric + composite section labels"
```

---

### Task 3: Strongest / Watch summary

**Files:**
- Modify: `src/lib/scorecard/labels.ts`
- Test: `src/lib/scorecard/labels.test.ts`

**Interfaces:**
- Produces: `strongestAndWatch(scorecard: ScorecardData): { strongest: MetricKey[]; watch: MetricKey[] }` — metrics labeled strong/good count as strengths (strong first), metrics labeled watch are the watch list. `insufficient` is excluded from both.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/lib/scorecard/labels.test.ts
import { strongestAndWatch } from "./labels";

test("strongestAndWatch splits strengths (strong>good) from watch, ignoring insufficient", () => {
  const sw = strongestAndWatch(fixture());
  // dom=strong, tenancy=good, rentPerformance=watch, marketing/cv=insufficient
  assert.deepEqual(sw.strongest, ["dom", "tenancy"]); // strong before good
  assert.deepEqual(sw.watch, ["rentPerformance"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/labels.test.ts`
Expected: FAIL — `strongestAndWatch` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to src/lib/scorecard/labels.ts
/** Section-header summary: strengths (strong, then good) and the watch list
 *  (metrics in the bottom band). Insufficient-data metrics are omitted. */
export function strongestAndWatch(
  scorecard: ScorecardData
): { strongest: MetricKey[]; watch: MetricKey[] } {
  const labels = metricLabels(scorecard);
  const strong = METRIC_KEYS.filter((k) => labels[k] === "strong");
  const good = METRIC_KEYS.filter((k) => labels[k] === "good");
  const watch = METRIC_KEYS.filter((k) => labels[k] === "watch");
  return { strongest: [...strong, ...good], watch };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/labels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/labels.ts src/lib/scorecard/labels.test.ts
git commit -m "feat(scorecard): strongest/watch section summary"
```

---

### Task 4: Momentum direction

**Files:**
- Create: `src/lib/scorecard/momentum.ts`
- Test: `src/lib/scorecard/momentum.test.ts`

**Interfaces:**
- Produces:
  - `interface MomentumSeries { values: Array<number | null> }` — an ordered time series (oldest → newest) for one momentum dimension; nulls are gaps.
  - `type MomentumDirection = "growing" | "stable" | "declining" | "volatile" | "insufficient"`
  - `momentumDirection(series: MomentumSeries, opts?: { minPoints?: number; flatBandPct?: number; volatilityPct?: number }): MomentumDirection`
- Contract for the pipeline phase: it must emit these ordered series (portfolio, listing-share, geographic-breadth, quality) so this function classifies them.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scorecard/momentum.test.ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { momentumDirection } from "./momentum";

test("insufficient when fewer than minPoints non-null values", () => {
  assert.equal(momentumDirection({ values: [null, 10] }), "insufficient"); // 1 real point
});

test("growing when net change exceeds the flat band", () => {
  assert.equal(momentumDirection({ values: [100, 110, 120, 135] }), "growing");
});

test("declining on a clear downtrend", () => {
  assert.equal(momentumDirection({ values: [135, 120, 110, 100] }), "declining");
});

test("stable when net change is within the flat band and low volatility", () => {
  assert.equal(momentumDirection({ values: [100, 101, 99, 100] }), "stable");
});

test("volatile when swings are large even if net change is small", () => {
  assert.equal(momentumDirection({ values: [100, 180, 60, 105] }), "volatile");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/momentum.test.ts`
Expected: FAIL — cannot find module `./momentum`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/scorecard/momentum.ts
// v0.24 — classify a momentum time series into a plain-English direction.
// Volatility is checked BEFORE net direction so a noisy series is flagged
// "volatile" rather than mislabeled by its endpoints (the spec's "recent
// estimates are volatile — interpret cautiously" case).

export interface MomentumSeries {
  /** Oldest → newest. null = gap / not observed that period. */
  values: Array<number | null>;
}

export type MomentumDirection =
  | "growing" | "stable" | "declining" | "volatile" | "insufficient";

export function momentumDirection(
  series: MomentumSeries,
  opts: { minPoints?: number; flatBandPct?: number; volatilityPct?: number } = {}
): MomentumDirection {
  const { minPoints = 3, flatBandPct = 0.05, volatilityPct = 0.4 } = opts;
  const pts = series.values.filter((v): v is number => v != null);
  if (pts.length < minPoints) return "insufficient";

  const first = pts[0];
  const last = pts[pts.length - 1];
  const base = Math.abs(first) || 1;

  // Volatility: largest period-over-period swing relative to the base.
  let maxSwing = 0;
  for (let i = 1; i < pts.length; i++) {
    maxSwing = Math.max(maxSwing, Math.abs(pts[i] - pts[i - 1]) / base);
  }
  const netChange = (last - first) / base;
  if (maxSwing >= volatilityPct && Math.abs(netChange) < maxSwing / 2) {
    return "volatile";
  }
  if (netChange > flatBandPct) return "growing";
  if (netChange < -flatBandPct) return "declining";
  return "stable";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/momentum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/momentum.ts src/lib/scorecard/momentum.test.ts
git commit -m "feat(scorecard): momentum-direction classifier"
```

---

### Task 5: Similar-local-players selection

**Files:**
- Create: `src/lib/scorecard/peers.ts`
- Test: `src/lib/scorecard/peers.test.ts`

**Interfaces:**
- Produces:
  - `interface PeerCandidate { slug: string; name: string; quadrant7Cell: string | null; estimatedUnits: number | null; operatingLabel: ScoreLabel; }`
  - `interface SelectedPeer extends PeerCandidate { isFocal: boolean; relativeSize: number; }` — `relativeSize` is 0–1 vs the largest in the returned set (for the size bar).
  - `selectSimilarLocalPlayers(focalSlug: string, candidates: PeerCandidate[], opts?: { limit?: number }): SelectedPeer[]`
- Rule: candidates are already same-market (caller filters by market). Keep same `quadrant7Cell` as the focal; rank by closeness in `estimatedUnits` to the focal; include the focal; return up to `limit` (default 5) sorted by size descending. Candidates missing `estimatedUnits` sort last.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scorecard/peers.test.ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { selectSimilarLocalPlayers, type PeerCandidate } from "./peers";

const C = (slug: string, units: number | null, q = "SFR Independent"): PeerCandidate => ({
  slug, name: slug, quadrant7Cell: q, estimatedUnits: units, operatingLabel: "good",
});

test("keeps same 7-cell, picks nearest-in-size to focal, includes focal, sorted desc", () => {
  const cands = [
    C("doorby", 644), C("river", 720), C("volunteer", 520),
    C("scenic", 410), C("lookout", 360), C("tiny", 30),
    C("apts", 900, "Large MF/BTR Independent"), // different cell — excluded
  ];
  const peers = selectSimilarLocalPlayers("doorby", cands, { limit: 4 });
  assert.deepEqual(peers.map((p) => p.slug), ["river", "doorby", "volunteer", "scenic"]);
  assert.equal(peers.find((p) => p.slug === "doorby")!.isFocal, true);
  assert.ok(peers.some((p) => p.relativeSize === 1)); // largest normalized to 1
  assert.ok(!peers.some((p) => p.quadrant7Cell === "Large MF/BTR Independent"));
});

test("focal always included even if it wouldn't rank by size alone", () => {
  const cands = [C("doorby", 50), C("a", 900), C("b", 880), C("c", 860), C("d", 840)];
  const peers = selectSimilarLocalPlayers("doorby", cands, { limit: 3 });
  assert.ok(peers.some((p) => p.slug === "doorby"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/peers.test.ts`
Expected: FAIL — cannot find module `./peers`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/scorecard/peers.ts
// v0.24 — "Similar local players": operators in the same market (caller-
// filtered) + same 7-cell classification, closest in estimated size to the
// focal operator. The focal is always included so the reader sees it in
// context. Pure — the caller supplies the candidate list from the seed.

import type { ScoreLabel } from "./labels";

export interface PeerCandidate {
  slug: string;
  name: string;
  quadrant7Cell: string | null;
  estimatedUnits: number | null;
  operatingLabel: ScoreLabel;
}

export interface SelectedPeer extends PeerCandidate {
  isFocal: boolean;
  /** 0–1 vs the largest in the returned set — drives the size bar. */
  relativeSize: number;
}

export function selectSimilarLocalPlayers(
  focalSlug: string,
  candidates: PeerCandidate[],
  opts: { limit?: number } = {}
): SelectedPeer[] {
  const limit = opts.limit ?? 5;
  const focal = candidates.find((c) => c.slug === focalSlug);
  if (!focal) return [];

  const sameCell = candidates.filter(
    (c) => c.quadrant7Cell === focal.quadrant7Cell && c.slug !== focalSlug
  );
  const sizeDist = (c: PeerCandidate) =>
    c.estimatedUnits == null || focal.estimatedUnits == null
      ? Number.POSITIVE_INFINITY
      : Math.abs(c.estimatedUnits - focal.estimatedUnits);

  const nearest = [...sameCell]
    .sort((a, b) => sizeDist(a) - sizeDist(b))
    .slice(0, Math.max(0, limit - 1));

  const chosen = [focal, ...nearest];
  const maxUnits = Math.max(...chosen.map((c) => c.estimatedUnits ?? 0), 1);

  return chosen
    .map((c) => ({
      ...c,
      isFocal: c.slug === focalSlug,
      relativeSize: (c.estimatedUnits ?? 0) / maxUnits,
    }))
    .sort((a, b) => (b.estimatedUnits ?? 0) - (a.estimatedUnits ?? 0));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/peers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scorecard/peers.ts src/lib/scorecard/peers.test.ts
git commit -m "feat(scorecard): similar-local-players selection"
```

---

### Task 6: Watch Items builder

**Files:**
- Create: `src/lib/scorecard/watch-items.ts`
- Test: `src/lib/scorecard/watch-items.test.ts`

**Interfaces:**
- Produces:
  - `type WatchItemKind = "risk" | "data" | "context" | "positive"`
  - `interface WatchItem { kind: WatchItemKind; headline: string; explanation: string; ask?: string; }`
  - `buildWatchItems(scorecard: ScorecardData, marketConcessionMedian: number | null): WatchItem[]` — ordered risk → data → context → positive.
- Fields read: `concessionRate` + `marketConcessionMedian`; `coverage.yearsVisible`; `lendingSignals.rentStability.volatilityPP` + `cohortMedianVolatility` + `suppressed`; `lendingSignals.geographicConcentration.top3CityShare` + `cohortMedianTop3`. (These already exist. Trend-based detectors — concession spike, rank/star change — are out of scope for this phase and added in the pipeline/detector phase.)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scorecard/watch-items.test.ts
import test from "node:test";
import { strict as assert } from "node:assert";
import { buildWatchItems } from "./watch-items";

function sc(overrides: any = {}): any {
  return {
    concessionRate: 0.48,
    coverage: { yearsVisible: 2.3 },
    lendingSignals: {
      rentStability: { volatilityPP: 1.1, cohortMedianVolatility: 3.0, suppressed: false },
      geographicConcentration: { top3CityShare: 0.84, cohortMedianTop3: 0.61 },
    },
    ...overrides,
  };
}

test("heavy concession use becomes a risk with an Ask, ordered first", () => {
  const items = buildWatchItems(sc(), 0.01);
  assert.equal(items[0].kind, "risk");
  assert.match(items[0].headline, /concession/i);
  assert.ok(items[0].ask && items[0].ask.length > 0);
});

test("short history is a data limitation; concentration is context; low volatility is positive", () => {
  const kinds = buildWatchItems(sc(), 0.01).map((i) => i.kind);
  assert.ok(kinds.includes("data"));
  assert.ok(kinds.includes("context"));
  assert.ok(kinds.includes("positive"));
  // ordering: risk before data before context before positive
  const order = ["risk", "data", "context", "positive"];
  const idx = kinds.map((k) => order.indexOf(k));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test("no items when nothing is notable", () => {
  const quiet = sc({
    concessionRate: 0.0,
    coverage: { yearsVisible: 6 },
    lendingSignals: {
      rentStability: { volatilityPP: 3.1, cohortMedianVolatility: 3.0, suppressed: false },
      geographicConcentration: { top3CityShare: 0.55, cohortMedianTop3: 0.61 },
    },
  });
  assert.equal(buildWatchItems(quiet, 0.01).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/scorecard/watch-items.test.ts`
Expected: FAIL — cannot find module `./watch-items`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/scorecard/watch-items.ts
// v0.24 — build categorized Watch Items from the signals already in the seed.
// Replaces the "Lending Signals" section. Kinds: risk (needs follow-up), data
// (limitation/caveat), context (neutral), positive. Not everything is bad.
// Trend-based detectors (concession spike, rank/star change) are added later
// once per-snapshot history exists; this phase covers point-in-time signals.

import type { ScorecardData } from "@/lib/types";

export type WatchItemKind = "risk" | "data" | "context" | "positive";

export interface WatchItem {
  kind: WatchItemKind;
  headline: string;
  explanation: string;
  /** Follow-up question — set on risks. */
  ask?: string;
}

const SHORT_HISTORY_YEARS = 3;
const CONCESSION_RISK_MULTIPLE = 5; // >=5x the market median flags a risk

export function buildWatchItems(
  scorecard: ScorecardData,
  marketConcessionMedian: number | null
): WatchItem[] {
  const items: WatchItem[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // RISK — heavy concession use vs market median.
  const rate = scorecard.concessionRate ?? null;
  const mkt = marketConcessionMedian;
  if (rate != null && rate > 0 && mkt != null && rate >= Math.max(0.1, mkt * CONCESSION_RISK_MULTIPLE)) {
    items.push({
      kind: "risk",
      headline: "Heavy concession use",
      explanation: `${pct(rate)} of trailing-12-month listings mention concessions, versus a ${pct(mkt)} market median.`,
      ask: "Is this pricing pressure, an aggressive leasing strategy, or standardized promotional language in their listings?",
    });
  }

  // DATA — short observation history.
  const years = scorecard.coverage?.yearsVisible ?? null;
  if (years != null && years < SHORT_HISTORY_YEARS) {
    items.push({
      kind: "data",
      headline: "Short observation history",
      explanation: `Observed only ${years.toFixed(1)} years — shorter than the ${SHORT_HISTORY_YEARS}-year reference window, so retention estimates may be biased low. Treat retention as directional, not precise.`,
    });
  }

  // CONTEXT — concentrated geography.
  const geo = scorecard.lendingSignals?.geographicConcentration;
  if (geo && geo.top3CityShare != null && geo.cohortMedianTop3 != null && geo.top3CityShare > geo.cohortMedianTop3) {
    items.push({
      kind: "context",
      headline: "Concentrated geography",
      explanation: `${pct(geo.top3CityShare)} of inventory sits in its top 3 cities (cohort median ${pct(geo.cohortMedianTop3)}) — a plus for a focused local operator, a drawback if you need geographic diversification.`,
    });
  }

  // POSITIVE — steady pricing (rent volatility below cohort median).
  const rs = scorecard.lendingSignals?.rentStability;
  if (rs && !rs.suppressed && rs.volatilityPP != null && rs.cohortMedianVolatility != null && rs.volatilityPP < rs.cohortMedianVolatility) {
    items.push({
      kind: "positive",
      headline: "Steady pricing",
      explanation: "Rent volatility is below the cohort median — pricing has been stable over the observed window.",
    });
  }

  const order: WatchItemKind[] = ["risk", "data", "context", "positive"];
  return items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/scorecard/watch-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm run test:watch-list && npx tsc --noEmit`
Expected: all scorecard tests pass, pre-existing tests pass, tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scorecard/watch-items.ts src/lib/scorecard/watch-items.test.ts
git commit -m "feat(scorecard): point-in-time Watch Items builder"
```

---

## Self-Review

**Spec coverage (Phase 1 scope only):** labels + bands ✓ (Tasks 1–2), section roll-up ✓ (Task 2), strongest/watch ✓ (Task 3), momentum direction ✓ (Task 4), similar-local-players ✓ (Task 5), Watch Items taxonomy + point-in-time signals ✓ (Task 6). Deferred to later phases (correctly, they need new data / are UI): per-metric + geo-breadth + share history and the trend-based Watch detectors (pipeline phase); all rendering (components phase); page assembly + Lending-Signals removal (assembly phase).

**Placeholder scan:** none — every code step has complete code; every test step has real assertions.

**Type consistency:** `ScoreLabel` (Task 1) is reused by `peers.ts` (Task 5) and the label functions (Task 2–3). `MetricKey` defined once (Task 2) and reused (Task 3). `MomentumSeries`/`MomentumDirection` self-contained (Task 4). `WatchItemKind`/`WatchItem` self-contained (Task 6). No forward references to undefined symbols.

**Note for the pipeline-phase plan:** it must emit ordered `MomentumSeries` for portfolio / listing-share / geographic-breadth / quality, and a `PeerCandidate[]` per market (slug, name, quadrant7Cell, estimatedUnits, operatingLabel) — these are this library's input contracts.
