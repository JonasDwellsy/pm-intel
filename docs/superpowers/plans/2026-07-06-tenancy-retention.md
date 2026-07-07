# Tenancy Retention (Survival-Based) + Departed-Operator Recency Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `overallGap` tenancy metric with a Kaplan-Meier 24-month retention metric, and add a 60-day departed-operator recency-exclusion eligibility gate.

**Architecture:** A new pure Python module (`tenancy_survival.py`) holds the survival math and gate predicates, unit-tested in isolation. `pipeline.py` calls it from `compute_tenancy`, adds the recency filter to the eligibility block, and switches the ranked metric value to `retention24Pct` (composite reweight is automatic — `compute_composite` already drops `None` metrics). `merge.py` needs no change (it passes each `pm` object through verbatim). The TypeScript display layer (`view-model.ts`) renders the new metric and a suppressed-caveat row; a handful of consumers repoint from `overallGap` to `retention24Pct`. Finally an all-markets re-run + audits regenerate the seed.

**Tech Stack:** Python 3 (stdlib only — `datetime`, `unittest`); TypeScript / Node test runner (`node --import tsx --test`); Next.js seed pipeline.

**Spec:** `docs/superpowers/specs/2026-07-06-tenancy-retention-redesign-design.md`

## Global Constraints

- **Never surface rank or composite** on any scorecard-facing output (HARD constraint). Tenancy copy is facts-not-judgments.
- **Do NOT run `prisma db seed` locally** — it writes the shared prod Neon DB. Re-seed happens on deploy. Pipeline runs use `--out-dir` scratch dirs only.
- **Do NOT read `.env*` files.**
- Constants are exact: `FLOOR_MONTHS = 3.0`, `MONTH_DAYS = 30.44`, `QUALIFY_MIN_ATRISK24 = 25`, `QUALIFY_MIN_EVENTS = 5`, `RECENCY_GATE_DAYS = 60`, horizons `{12, 24, 36}`.
- Retention values are stored as percentages 0–100, 1 decimal. `retention24Pct` is `None` when unqualified.
- Legacy tenancy fields (`overallGap`, `multiEpisodePct`, `multiEpisodeUnits`, `house`, `apartment`) are preserved unchanged (they still feed the Classic/PDF vacancy signal).
- `NOW` in `pipeline.py` already equals the market's `DATA_AS_OF` — use it for all censoring/recency math. Do not introduce wall-clock time.
- Python pipeline is run with `scripts/data-pipeline/` as the working directory.
- JS test command: `npm run test:watch-list`. Typecheck: `npx tsc --noEmit`.

---

### Task 1: Pure survival module + unit tests

**Files:**
- Create: `scripts/data-pipeline/tenancy_survival.py`
- Test: `scripts/data-pipeline/test_tenancy_survival.py`

**Interfaces:**
- Produces (imported by Task 2/3):
  - `compute_tenancy_survival(episodes_by_unit: dict[str, list[tuple[datetime, datetime|None]]], now: datetime) -> dict` — returns keys `retention24Pct`, `retentionCurve`, `kmMedianMonths`, `atRisk24`, `turnoverEvents`, `tenancyQualified`, `tenancySuppressed`.
  - `is_departed(last_event_dt: datetime|None, now: datetime, gate_days: int = RECENCY_GATE_DAYS) -> bool`
  - Constants `RECENCY_GATE_DAYS`, `FLOOR_MONTHS`, `QUALIFY_MIN_ATRISK24`, `QUALIFY_MIN_EVENTS`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/data-pipeline/test_tenancy_survival.py`:

```python
import unittest
from datetime import datetime, timedelta
from tenancy_survival import (
    build_observations, km_curve, retention_at, km_median, at_risk,
    compute_tenancy_survival, is_departed,
    FLOOR_MONTHS, QUALIFY_MIN_ATRISK24, QUALIFY_MIN_EVENTS, RECENCY_GATE_DAYS,
)

NOW = datetime(2026, 7, 6)
def days_ago(n): return NOW - timedelta(days=n)

class BuildObservations(unittest.TestCase):
    def test_turnover_event_recorded(self):
        # unit listed, closed 800d ago, re-listed 700d ago -> ~3.3mo occupied gap = event
        eps = {"u": [(days_ago(900), days_ago(800)), (days_ago(700), days_ago(600))]}
        obs = build_observations(eps, NOW)
        self.assertIn(1, [e for _, e in obs])            # has a turnover event
        ev = [d for d, e in obs if e == 1][0]
        self.assertGreaterEqual(ev, FLOOR_MONTHS)

    def test_repost_below_floor_dropped(self):
        # closed then re-listed 30 days later -> < 3mo -> dropped (no event)
        eps = {"u": [(days_ago(400), days_ago(300)), (days_ago(270), None)]}
        obs = build_observations(eps, NOW)
        self.assertEqual([e for _, e in obs if e == 1], [])   # no turnover event

    def test_still_occupied_is_censored(self):
        # single listing closed 300d ago, never re-listed -> censored obs (~9.9mo)
        eps = {"u": [(days_ago(500), days_ago(300))]}
        obs = build_observations(eps, NOW)
        self.assertEqual(len(obs), 1)
        dur, event = obs[0]
        self.assertEqual(event, 0)
        self.assertAlmostEqual(dur, 300 / 30.44, places=1)

    def test_open_listing_yields_no_observation(self):
        # last listing still open (deactivation None) -> on-market, no observation
        eps = {"u": [(days_ago(100), None)]}
        self.assertEqual(build_observations(eps, NOW), [])

class KMEstimator(unittest.TestCase):
    def test_retention_monotonic_and_bounded(self):
        obs = [(6, 1), (12, 1), (30, 0), (40, 0), (48, 0)]
        curve = km_curve(obs)
        r12, r24 = retention_at(curve, 12), retention_at(curve, 24)
        self.assertLessEqual(r24, r12)
        self.assertTrue(0.0 <= r24 <= 1.0)

    def test_no_events_gives_full_retention(self):
        obs = [(30, 0), (40, 0)]                 # all censored, no turnover
        self.assertEqual(retention_at(km_curve(obs), 24), 1.0)

    def test_at_risk_counts_observations_past_horizon(self):
        obs = [(10, 1), (25, 0), (30, 1), (40, 0)]
        self.assertEqual(at_risk(obs, 24), 3)    # 25, 30, 40 are >= 24

    def test_km_median_none_when_never_crosses_half(self):
        obs = [(30, 0)] * 10                      # never drops below 0.5
        self.assertIsNone(km_median(km_curve(obs)))

class ComputeTenancySurvival(unittest.TestCase):
    def _sticky_units(self, n, occupied_days=800):
        # n units each closed occupied_days ago, never re-listed -> n censored obs past 24mo
        return {f"u{i}": [(days_ago(occupied_days + 200), days_ago(occupied_days))] for i in range(n)}

    def test_unqualified_when_too_few_at_risk(self):
        out = compute_tenancy_survival(self._sticky_units(QUALIFY_MIN_ATRISK24 - 1), NOW)
        self.assertFalse(out["tenancyQualified"])
        self.assertIsNone(out["retention24Pct"])
        self.assertTrue(out["tenancySuppressed"])

    def test_unqualified_when_too_few_events(self):
        # 40 censored units past 24mo (at-risk ok) but 0 turnover events -> min-events gate fails
        out = compute_tenancy_survival(self._sticky_units(40), NOW)
        self.assertGreaterEqual(out["atRisk24"], QUALIFY_MIN_ATRISK24)
        self.assertEqual(out["turnoverEvents"], 0)
        self.assertFalse(out["tenancyQualified"])
        self.assertIsNone(out["retention24Pct"])

    def test_qualified_emits_retention(self):
        units = {}
        # 30 units that turned over at ~30 months (event), plus 30 still-occupied past 24mo
        for i in range(30):
            units[f"t{i}"] = [(days_ago(1100), days_ago(1000)), (days_ago(90), None)]
        for i in range(30):
            units[f"c{i}"] = [(days_ago(900), days_ago(800))]
        out = compute_tenancy_survival(units, NOW)
        self.assertTrue(out["tenancyQualified"])
        self.assertIsNotNone(out["retention24Pct"])
        self.assertGreaterEqual(out["turnoverEvents"], QUALIFY_MIN_EVENTS)
        self.assertEqual(set(out["retentionCurve"]), {"m12", "m24", "m36"})

class RecencyGate(unittest.TestCase):
    def test_departed_when_silent_past_gate(self):
        self.assertTrue(is_departed(days_ago(RECENCY_GATE_DAYS + 21), NOW))

    def test_active_within_gate(self):
        self.assertFalse(is_departed(days_ago(3), NOW))

    def test_none_last_event_is_departed(self):
        self.assertTrue(is_departed(None, NOW))

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd scripts/data-pipeline && python3 test_tenancy_survival.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'tenancy_survival'`.

- [ ] **Step 3: Write the module**

Create `scripts/data-pipeline/tenancy_survival.py`:

```python
#!/usr/bin/env python3
"""Pure survival-analysis helpers for the tenancy metric (24-month retention).

No side effects, no argv, no I/O — safe to import from pipeline.py and unit
tests. See docs/superpowers/specs/2026-07-06-tenancy-retention-redesign-design.md.

Model: each unit's OCCUPIED interval between two listings is a tenancy.
  event (turnover)   = next_creation - prev_deactivation  (>= FLOOR_MONTHS)
  right-censored     = now - last_deactivation            (still occupied)
Kaplan-Meier over events + censored obs -> S(t) = P(tenancy lasts >= t months).
Ranked metric = S(24). Qualify only when enough units reached 24 months AND
there are real turnover events (guards a frozen-inventory snapshot).
"""

MONTH_DAYS = 30.44
FLOOR_MONTHS = 3.0
QUALIFY_MIN_ATRISK24 = 25
QUALIFY_MIN_EVENTS = 5
RECENCY_GATE_DAYS = 60


def build_observations(episodes_by_unit, now):
    """episodes_by_unit: {unit_id: [(creation_dt, deactivation_dt|None), ...]}.
    Returns pooled [(duration_months, event)] across all units. event=1 turnover,
    0 right-censored. Re-post intervals (< FLOOR_MONTHS) are dropped entirely."""
    obs = []
    for eps in episodes_by_unit.values():
        eps = sorted(eps, key=lambda x: x[0])
        for i in range(1, len(eps)):
            prev_deact = eps[i - 1][1]
            curr_creation = eps[i][0]
            if prev_deact and curr_creation and curr_creation > prev_deact:
                dur = (curr_creation - prev_deact).days / MONTH_DAYS
                if dur >= FLOOR_MONTHS:
                    obs.append((dur, 1))
        last_deact = eps[-1][1] if eps else None
        if last_deact:
            dur = (now - last_deact).days / MONTH_DAYS
            if dur >= 0:
                obs.append((dur, 0))
    return obs


def km_curve(observations):
    """Kaplan-Meier product-limit estimator. Returns [(t, S(t))] at event times."""
    event_times = sorted(set(t for t, e in observations if e == 1))
    S = 1.0
    curve = []
    for t in event_times:
        n_at_risk = sum(1 for d, _ in observations if d >= t)
        n_events = sum(1 for d, e in observations if e == 1 and abs(d - t) < 1e-9)
        if n_at_risk > 0:
            S *= (1 - n_events / n_at_risk)
        curve.append((t, S))
    return curve


def retention_at(curve, h):
    """S(h): the last S at an event time <= h; 1.0 if no event <= h."""
    s = 1.0
    for t, sv in curve:
        if t <= h:
            s = sv
        else:
            break
    return s


def km_median(curve):
    """First t where S(t) <= 0.5; None if the curve never crosses 0.5 in-window."""
    return next((t for t, sv in curve if sv <= 0.5), None)


def at_risk(observations, h):
    """# observations (event or censored) lasting >= h months."""
    return sum(1 for d, _ in observations if d >= h)


def compute_tenancy_survival(episodes_by_unit, now):
    """Full derived tenancy-survival block for one operator."""
    obs = build_observations(episodes_by_unit, now)
    curve = km_curve(obs)
    r12 = round(retention_at(curve, 12) * 100, 1)
    r24 = round(retention_at(curve, 24) * 100, 1)
    r36 = round(retention_at(curve, 36) * 100, 1)
    km_med = km_median(curve)
    ar24 = at_risk(obs, 24)
    events = sum(1 for _, e in obs if e == 1)
    qualified = ar24 >= QUALIFY_MIN_ATRISK24 and events >= QUALIFY_MIN_EVENTS
    return {
        "retention24Pct": r24 if qualified else None,
        "retentionCurve": {"m12": r12, "m24": r24, "m36": r36},
        "kmMedianMonths": round(km_med, 1) if km_med is not None else None,
        "atRisk24": ar24,
        "turnoverEvents": events,
        "tenancyQualified": qualified,
        "tenancySuppressed": not qualified,
    }


def is_departed(last_event_dt, now, gate_days=RECENCY_GATE_DAYS):
    """True if the operator's most recent listing event is older than gate_days
    before now (or there is none). Departed operators are excluded from ranking."""
    if last_event_dt is None:
        return True
    return (now - last_event_dt).days > gate_days
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd scripts/data-pipeline && python3 test_tenancy_survival.py`
Expected: `OK` — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/tenancy_survival.py scripts/data-pipeline/test_tenancy_survival.py
git commit -m "feat(pipeline): pure KM survival module for tenancy retention"
```

---

### Task 2: Wire survival into `compute_tenancy` (pipeline.py)

**Files:**
- Modify: `scripts/data-pipeline/pipeline.py` (import; `compute_tenancy` at 755–789; tenancy-block assembly at ~1617–1624)

**Interfaces:**
- Consumes: `compute_tenancy_survival` from Task 1.
- Produces: `feats["tenancy_block"]` now carries the new survival keys plus legacy keys; `feats["tenancy_block"]["retention24Pct"]` (used by Task 4); `ten["tenancySuppressedReason"]` on the emitted PM.

- [ ] **Step 1: Add the import**

After the existing stdlib imports near the top of `pipeline.py`, add a path-safe import so the module resolves regardless of CWD:

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tenancy_survival import compute_tenancy_survival, is_departed, RECENCY_GATE_DAYS
```

(If `os`/`sys` are already imported at the top, keep them once — only add the `sys.path.insert` line and the `from tenancy_survival import ...` line.)

- [ ] **Step 2: Merge survival output into `compute_tenancy`**

In `compute_tenancy(d)` (pipeline.py:755), keep the entire existing body that computes `overallGap`, `multiEpisodePct`, `house`, `apartment`, etc. Change ONLY the final `return` (currently lines 782–789) to build the legacy dict, then fold in the survival block:

```python
    block = {
        "totalUnits": total_units,
        "multiEpisodeUnits": multi_episode_units,
        "multiEpisodePct": multi_episode_pct,
        "overallGap": round(statistics.median(gaps_all), 1) if gaps_all else None,
        "house": stats_block(gaps_house),
        "apartment": stats_block(gaps_apt),
    }
    block.update(compute_tenancy_survival(d["tenancy_episodes"], NOW))
    return block
```

- [ ] **Step 3: Set `tenancySuppressedReason` where `years_visible` is known**

In the tenancy-block assembly block (pipeline.py ~1617–1624, where `ten = dict(feats["tenancy_block"])` and `ten["shortHistoryFlag"]`/`ten["yearsVisible"]` are set), add after the existing `ten[...]` assignments:

```python
    yv = feats["years_visible"]
    ten["tenancySuppressedReason"] = (
        f"Too early to assess renewal — this operator has been tracked "
        f"{yv:.1f} years." if ten.get("tenancySuppressed") and yv is not None
        else None
    )
```

- [ ] **Step 4: Integration check — run one small market and inspect the tenancy block**

Run (montgomery-al is small, ~30 ranked; writes to a scratch out-dir, never the DB):

```bash
cd scripts/data-pipeline && mkdir -p /tmp/iq_ten && \
python3 pipeline.py --market montgomery-al --config markets.json --out-dir /tmp/iq_ten && \
python3 -c "import json,glob; b=json.load(open(sorted(glob.glob('/tmp/iq_ten/*ontgomery*'))[0])); t=b['pms'][0]['tenancy']; print({k:t[k] for k in ('overallGap','retention24Pct','retentionCurve','atRisk24','turnoverEvents','tenancyQualified','tenancySuppressed','tenancySuppressedReason')})"
```

Expected: the printed dict contains BOTH `overallGap` (legacy, non-null-ish) AND the new keys; qualified operators show a numeric `retention24Pct` with `tenancySuppressed=False`; suppressed ones show `retention24Pct=None` with a `tenancySuppressedReason` string.

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(pipeline): compute_tenancy emits survival retention + keeps legacy gap"
```

---

### Task 3: Departed-operator recency-exclusion gate (pipeline.py)

**Files:**
- Modify: `scripts/data-pipeline/pipeline.py` (per-operator init `init_rich` ~419; stream tracking ~553; eligibility block ~642–647)

**Interfaces:**
- Consumes: `is_departed`, `RECENCY_GATE_DAYS` (imported in Task 2).
- Produces: departed operators absent from `eligible_norms` (and thus from `pm_features`, cohorts, and the seed).

- [ ] **Step 1: Track `last_event_dt` per operator — init**

In `init_rich(norm)` (pipeline.py ~421), add to the dict literal (next to `"earliest_ct": None,`):

```python
        "last_event_dt": None,
```

- [ ] **Step 2: Track `last_event_dt` per operator — in the stream**

In the streaming loop, next to the existing `earliest_ct` update (pipeline.py ~553), add (both `ct` and the parsed deactivation `dt_` are in scope here):

```python
        for _ev in (ct, dt_):
            if _ev and (d["last_event_dt"] is None or _ev > d["last_event_dt"]):
                d["last_event_dt"] = _ev
```

- [ ] **Step 3: Add the recency filter to the eligibility block**

In the eligibility block (pipeline.py 643–647), add the recency check as the first filter inside the loop:

```python
eligible_norms = set()
for norm, d in pm_rich.items():
    if is_departed(d["last_event_dt"], NOW, RECENCY_GATE_DAYS): continue
    if d["t12_listings"] < ELIG_T12_MIN: continue
    if len(d["address_t12"]) < ELIG_ADDR_MIN and not has_big_community(d): continue
    if d["active_listings"] < 1 and d["t12_listings"] < 1: continue
    eligible_norms.add(norm)
```

- [ ] **Step 4: Integration check — confirm a departed operator is excluded**

Nashville's `Goldberg Companies` (330 days silent) and `Bridge Property Management` (81 days silent) are both known departed. Run Nashville to a scratch dir and confirm neither appears:

```bash
cd scripts/data-pipeline && \
python3 pipeline.py --market nashville-davidson-murfreesboro-franklin-tn --config markets.json --out-dir /tmp/iq_ten && \
python3 -c "import json,glob; b=json.load(open(sorted(glob.glob('/tmp/iq_ten/*ashville*'))[0])); names={p['name'] for p in b['pms']}; print('Goldberg present:', any('Goldberg' in n for n in names)); print('Bridge present:', any(n.startswith('Bridge Property') for n in names)); print('total ranked:', len(b['pms']))"
```

Expected: `Goldberg present: False`, `Bridge present: False`, and `total ranked` lower than a pre-change run (recency gate removed ~5 Nashville operators).

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(pipeline): 60-day departed-operator recency exclusion gate"
```

---

### Task 4: Switch ranked metric to retention24 + weighting label (pipeline.py)

**Files:**
- Modify: `scripts/data-pipeline/pipeline.py` (metric_values assign at 1025; weightingScheme label at ~1777–1779)

**Interfaces:**
- Consumes: `feats["tenancy_block"]["retention24Pct"]`.
- Produces: `metric_values["tenancy"]` = retention24 (or `None`); composite auto-reweights via existing `w_used` logic (no change to `compute_composite`).

- [ ] **Step 1: Repoint the tenancy metric value**

At pipeline.py:1025, change:

```python
    metric_values["tenancy"][norm] = feats["tenancy_block"]["overallGap"]
```
to:
```python
    metric_values["tenancy"][norm] = feats["tenancy_block"]["retention24Pct"]
```

(Direction is unchanged: higher retention = better = the existing ascending percentile branch. `None` for suppressed operators is handled by `percentile_for_metric` and `compute_composite` exactly as `rentPerformance`'s `None` already is.)

- [ ] **Step 2: Note tenancy suppression in the weighting-scheme label**

At the `weightingScheme` label (pipeline.py ~1777–1779), extend it so a tenancy-suppressed operator's redistribution is visible. Replace the two-branch expression with one that also accounts for tenancy being `None`:

```python
            "weightingScheme": _weighting_scheme_label(
                cv is not None,
                (multi_pct[norm].get("tenancy") or {}).get("msa") is not None,
            ),
```

and add this helper near the other module-level helpers (e.g. just above the PM-emit loop):

```python
def _weighting_scheme_label(has_cv, has_tenancy):
    parts = []
    parts.append("CV15" if has_cv else "CV suppressed")
    parts.append("Tenancy30" if has_tenancy else "Tenancy suppressed")
    base = "DOM/RentPerformance/Marketing"
    suffix = "" if (has_cv and has_tenancy) else " (redistributed)"
    return f"{base}; {parts[1]}; {parts[0]}{suffix}"
```

(The exact human-readable string is not surfaced on the scorecard; it only needs to record which metrics were redistributed. Keep it a plain descriptive string — no rank/composite values.)

- [ ] **Step 3: Integration check — composite reweights for a suppressed operator**

```bash
cd scripts/data-pipeline && \
python3 pipeline.py --market montgomery-al --config markets.json --out-dir /tmp/iq_ten && \
python3 -c "
import json,glob
b=json.load(open(sorted(glob.glob('/tmp/iq_ten/*ontgomery*'))[0]))
sup=[p for p in b['pms'] if p['tenancy'].get('tenancySuppressed')]
print('suppressed count:', len(sup))
if sup:
    p=sup[0]; print('example:', p['name'], '| composite present:', p['rank'].get('composite') is not None, '| weighting:', p['rank'].get('weightingScheme'))
"
```

Expected: suppressed operators still receive a composite (`composite present: True`) — proving the 30% redistributed rather than nulling the rank — and their `weightingScheme` notes tenancy suppression.

- [ ] **Step 4: Commit**

```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(pipeline): rank tenancy on 24-month retention; label reweighting"
```

---

### Task 5: TypeScript types (types.ts)

**Files:**
- Modify: `src/lib/types.ts` (the `tenancy` block, ~193–205)

**Interfaces:**
- Produces: the new optional tenancy fields consumed by Tasks 6–8.

- [ ] **Step 1: Add the new fields**

In the `tenancy: { ... }` block in `src/lib/types.ts`, add after the existing fields (keep all existing fields):

```typescript
    retention24Pct: number | null;
    retentionCurve?: { m12: number; m24: number; m36: number };
    kmMedianMonths?: number | null;
    atRisk24?: number;
    turnoverEvents?: number;
    tenancyQualified?: boolean;
    tenancySuppressed?: boolean;
    tenancySuppressedReason?: string | null;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no new errors from `types.ts` (existing consumers still compile because the new fields are additive; `retention24Pct` is required in the type but all seed objects will carry it after the re-run — test fixtures are updated in Tasks 7–8).

Note: if `tsc` reports fixture objects missing `retention24Pct`, that is expected and is fixed in Tasks 7–8 where those fixtures are touched. If it blocks, make `retention24Pct` `number | null` optional (`retention24Pct?: number | null`) — but prefer required to catch missing wiring.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add survival retention fields to tenancy block"
```

---

### Task 6: Render retention + suppressed caveat (view-model.ts) + tests

**Files:**
- Modify: `src/lib/scorecard/view-model.ts` (`metricValueBenchmark` tenancy branch 181–198; cohort-median 432–440; call site 447; metrics filter ~445)
- Test: `src/lib/scorecard/view-model.test.ts`

**Interfaces:**
- Consumes: `sc.tenancy.retention24Pct`, `tenancySuppressed`, `tenancySuppressedReason`; cohort peers' `retention24Pct`.
- Produces: the "Tenant retention" metric row value/benchmark/interpretation and a visible suppressed row.

- [ ] **Step 1: Write/adjust the failing tests**

In `src/lib/scorecard/view-model.test.ts`, update the tenancy fixtures/assertions to the new metric and add a suppressed-path test. Replace the existing tenancy-display assertions (the ones asserting `"13.0mo"` / `overallGap` decoys) with:

```typescript
test("tenancy renders 24-month retention, not overallGap or multiEpisodePct", () => {
  const sc = scFixture({
    pm: { slug: "x", name: "X", quadrant7Cell: "SFR Independent" },
    // decoys that must NOT be shown as the value:
    tenancy: { overallGap: 13.0, multiEpisodePct: 88, retention24Pct: 72.4,
               tenancyQualified: true, tenancySuppressed: false, star: "gold" },
  });
  const vm = buildScorecardView(sc, /* pool */ [{ slug: "x", name: "X", quadrant7Cell: "SFR Independent", scorecard: sc }]);
  const row = vm.metrics.find((m) => m.key === "tenancy")!;
  assert.equal(row.value, "72% stay 2+ yrs");     // retention24Pct — NOT 13.0mo / 88%
});

test("tenancy suppressed shows the caveat, not a value", () => {
  const sc = scFixture({
    pm: { slug: "y", name: "Y", quadrant7Cell: "SFR Independent" },
    tenancy: { overallGap: 9, retention24Pct: null, tenancyQualified: false,
               tenancySuppressed: true,
               tenancySuppressedReason: "Too early to assess renewal — this operator has been tracked 1.3 years.",
               star: null },
  });
  const vm = buildScorecardView(sc, [{ slug: "y", name: "Y", quadrant7Cell: "SFR Independent", scorecard: sc }]);
  const row = vm.metrics.find((m) => m.key === "tenancy");
  assert.ok(row, "suppressed tenancy row is still present");
  assert.equal(row!.value, "—");
  assert.match(row!.interpretation, /Too early to assess renewal/);
});
```

Adjust `scFixture` calls elsewhere in this file that set `tenancy: { overallGap: N }` to also include `retention24Pct` (mirror the value) so they keep passing — e.g. the cohort fixtures at ~433–434 gain `retention24Pct: <n>`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:watch-list`
Expected: FAIL on the two new tenancy tests (value is still `"13.0mo"` / suppressed row absent).

- [ ] **Step 3: Rewrite the tenancy branch in `metricValueBenchmark`**

Change the signature param name and the tenancy branch. Rename param `tenancyCohortMedianMonths` → `cohortMedianRetention24` (line 142), and replace the whole `if (k === "tenancy") { ... }` block (181–197) with:

```typescript
  if (k === "tenancy") {
    const r = sc.tenancy?.retention24Pct;
    if (sc.tenancy?.tenancySuppressed || r == null) {
      return {
        value: "—",
        benchmark: "",
        sub: [],
        interpretation: sc.tenancy?.tenancySuppressedReason ?? "",
      };
    }
    return {
      value: `${Math.round(r)}% stay 2+ yrs`,
      benchmark: cohortMedianRetention24 != null ? `cohort ${Math.round(cohortMedianRetention24)}%` : "",
      sub: [],
      interpretation: cohortMedianRetention24 != null
        ? `About ${Math.round(r)}% of ${sc.pm.name}'s tenancies reach two years, versus a ${Math.round(cohortMedianRetention24)}% cohort median.`
        : `About ${Math.round(r)}% of ${sc.pm.name}'s tenancies reach two years.`,
    };
  }
```

- [ ] **Step 4: Repoint the cohort median to retention24**

Replace the cohort-median computation (view-model.ts 432–440) with retention24 across QUALIFIED peers:

```typescript
  const cohortQ7 = scorecard.pm.quadrant7Cell ?? null;
  const cohortRetention = cohortQ7
    ? pool
        .filter((m) => m.scorecard.pm?.quadrant7Cell === cohortQ7 && m.scorecard.tenancy?.retention24Pct != null)
        .map((m) => m.scorecard.tenancy!.retention24Pct as number)
        .sort((a, b) => a - b)
    : [];
  const cohortMedianRetention24 =
    cohortRetention.length > 0
      ? cohortRetention[Math.floor((cohortRetention.length - 1) / 2)]
      : null;
```

And at the call site (line 447) pass the renamed value:

```typescript
      const vb = metricValueBenchmark(scorecard, k, k === "tenancy" ? cohortMedianRetention24 : null);
```

- [ ] **Step 5: Keep the suppressed tenancy row visible**

The metrics filter (~445–446) drops metrics with no percentile and no star. Include a suppressed tenancy so its caveat renders. Change:

```typescript
    .filter((k) => pcts[k] != null || metricStar(scorecard, k) != null)
```
to:
```typescript
    .filter((k) => pcts[k] != null || metricStar(scorecard, k) != null
      || (k === "tenancy" && scorecard.tenancy?.tenancySuppressed === true))
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:watch-list`
Expected: PASS (both new tenancy tests + all previously-passing tests).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/scorecard/view-model.ts src/lib/scorecard/view-model.test.ts
git commit -m "feat(scorecard): render 24-month retention + suppressed caveat"
```

---

### Task 7: Repoint remaining consumers (peer-comparison, metric-definitions, ask-tools, watch-list, stars) + tests

**Files:**
- Modify: `src/lib/peer-comparison.ts` (~45)
- Modify: `src/lib/metric-definitions.ts` (tenancy definition)
- Modify: `src/lib/ask-tools.ts` (~435)
- Modify: `src/lib/watch-list/scoring.ts`, `src/lib/watch-list/evaluator.ts` (+ their `.test.ts` fixtures) — the `tenancy.medianTenancy` consumers
- Modify: `src/lib/operators/stars.ts` (comment at 17)
- Test: existing `*.test.ts` for the above

**Interfaces:**
- Consumes: `sc.tenancy.retention24Pct`.

- [ ] **Step 1: Audit the watch-list tenancy field wiring**

Run: `grep -rn "medianTenancy\|\.overallGap\|tenancy\." src/lib/watch-list src/lib/peer-comparison.ts src/lib/ask-tools.ts` and read each hit. Confirm the source of `medianTenancy` (it is a mapped field derived when building the watch-list snapshot). Decide per hit whether it should read `retention24Pct` (ranking/alert semantics) — record the decision inline in the commit.

- [ ] **Step 2: Write/adjust failing tests**

For each consumer that has a test, add or adjust one assertion that the new metric flows. Example for `peer-comparison` (adapt to the actual test file/shape):

```typescript
test("peer comparison ranks tenancy on retention24Pct", () => {
  const a = mkPm({ slug: "a", tenancy: { retention24Pct: 80, overallGap: 5 } });
  const b = mkPm({ slug: "b", tenancy: { retention24Pct: 40, overallGap: 20 } });
  const ranked = peerCompare([a, b], "tenancy");
  assert.equal(ranked[0].slug, "a");   // higher retention ranks first, not lower gap
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:watch-list`
Expected: FAIL on the new assertions.

- [ ] **Step 4: Make the edits**

- `peer-comparison.ts:45` — return `sc.tenancy.retention24Pct` (was `sc.tenancy.overallGap`); skip members whose `retention24Pct == null`.
- `metric-definitions.ts` (tenancy) — rewrite the definition string to: `"Share of tenancies that reach two years (24-month retention, survival-adjusted). Higher means stickier tenants."`
- `ask-tools.ts:435` — add `tenancyRetention24Pct: sc.tenancy.retention24Pct` (keep `tenancyMultiEpisodePct`); do NOT add any rank/composite field.
- `watch-list/scoring.ts` + `evaluator.ts` — repoint `medianTenancy` to `retention24Pct` (or map it at the snapshot boundary); update fixtures in their `.test.ts` to include `retention24Pct`.
- `operators/stars.ts:17` — update the comment to `// 4. tenancy.star — Tenant retention (24-month survival retention)`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test:watch-list && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/peer-comparison.ts src/lib/metric-definitions.ts src/lib/ask-tools.ts src/lib/watch-list src/lib/operators/stars.ts
git commit -m "feat: repoint tenancy consumers to 24-month retention"
```

---

### Task 8: Full re-run, audits, verification, PR

**Files:**
- Uses: `scripts/data-pipeline/pipeline.py`, `apply_canonicals.py`, `normalize_pm_names.py`, `merge.py`, `build-operator-universe.ts`; scratch audit scripts in the session scratchpad.

**Interfaces:** none (produces the regenerated seed + audit evidence).

- [ ] **Step 1: Re-run the full pipeline for all 34 markets**

For each market id in `markets.json`, run `pipeline.py --market <id> --config markets.json --out-dir <data-dir>` (the established batch step). Then `apply_canonicals.py --decisions <all p1..p8> --data-dir <dir> --apply`, `normalize_pm_names.py --data-dir <dir> --apply`, `merge.py --apply --data-dir <dir>`, then `build-operator-universe.ts`. (Same sequence used for prior market batches — reuse that runbook.)

- [ ] **Step 2: Recency-gate exclusion audit**

Run the validation script (already written) against the fresh data and confirm the departed count is ~304 (7.6%) and per-market spread matches the committed `docs/superpowers/specs/2026-07-06-departed-operators-validation.csv` within reason. Spot-check the 61–90-day borderline band for any obvious false positive.

Expected: count stable; Bridge/Goldberg/McCormack Baron absent from the merged seed's `pms`.

- [ ] **Step 3: Before/after rank + metric audit**

Read-only over the previous committed seed vs the newly merged seed:
- Composite-rank change distribution.
- Tenancy-suppressed rate ≈ 29% (the `<2yr` window population); confirm the *right* operators are suppressed (young/small) and that established large operators (e.g. UDR, `atRisk24=183`) stay qualified.
- `retention24Pct` / `kmMedianMonths` distributions; sanity vs Nashville (median tenancy in the 30s of months, not ~7).
- **Anti-artifact tripwire:** count qualified operators with `retention24Pct >= 98 & turnoverEvents <= 2` — expect 0.
- **Staleness sanity:** median days-since-last-listing in the ranked set is single digits (no residual departed operators).
- Threshold sensitivity: re-tabulate suppression at `QUALIFY_MIN_ATRISK24 ∈ {20,25,30}` and `QUALIFY_MIN_EVENTS ∈ {0,5,10}`; confirm 25 / 5.

- [ ] **Step 4: Typecheck + full JS test suite**

Run: `npx tsc --noEmit && npm run test:watch-list`
Expected: clean; all tests pass.

- [ ] **Step 5: Screenshot New scorecards (qualified + suppressed)**

Use the `/dev/scorecards/[slug]?view=new` harness + headless-Chrome CLI to capture one qualified operator (retention headline) and one suppressed operator (caveat row). Confirm no rank/composite leaks and the copy reads factually.

- [ ] **Step 6: Commit the regenerated seed + derived files, open PR**

```bash
git add src/data/scorecard_data.json scripts/data-pipeline/markets-summary.json scripts/data-pipeline/merge_fragments.json src/data/search_index.json
git commit -m "data: re-seed all 34 markets — 24-month retention + recency exclusion"
git push -u origin feat/tenancy-retention
gh pr create --title "Tenancy: 24-month retention + departed-operator recency gate" --body "<summary + audit results + links to spec/plan>"
```

(Do NOT merge — Jonas merges explicitly. Re-seed runs on deploy after merge.)

---

## Self-Review

**Spec coverage:** §2/§4 survival math → Task 1; §4 `compute_tenancy` + `tenancySuppressedReason` → Task 2; §4.5 recency gate → Task 3; §5 ranking/composite/label → Task 4; §7.1 types → Task 5; §7.2 display + cohort median + suppressed row → Task 6; §7.3 consumers → Task 7; §6 `overallGap`/vacancy kept → covered by "legacy preserved" in Tasks 2/5 (no code change needed); §8 migration/audits → Task 8. All spec sections map to a task.

**Placeholder scan:** every code step contains real code or an exact command with expected output. Task 7 Step 1 (watch-list audit) is a directed investigation because the exact `medianTenancy` mapping must be read in the code before editing — Step 4 then names the concrete edits.

**Type consistency:** `retention24Pct` (number|null), `retentionCurve.{m12,m24,m36}`, `tenancySuppressed`/`tenancySuppressedReason` are named identically across the Python emit (Task 2), the TS type (Task 5), and every TS consumer (Tasks 6–7). The cohort-median variable is renamed consistently (`tenancyCohortMedianMonths` → `cohortMedianRetention24`) at its definition, the function param, and the call site (Task 6 Steps 3–4).

**Sequencing:** Tasks 1–4 (pipeline) are independent of 5–7 (TS); Task 8 requires all prior tasks. The recency gate (Task 3) is self-contained and could be split into its own PR ahead of the metric if desired, but both share the single re-seed in Task 8, so shipping together is the default.
