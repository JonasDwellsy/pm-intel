# Tenancy Metric Redesign: 24-Month Retention (Survival-Based)

**Status:** Design approved (2026-07-06), pending spec review.
**Owner:** Jonas Bordo / Operator IQ
**Supersedes:** the `overallGap` "median months between successive listings" tenancy metric (pipeline.py `compute_tenancy`).

---

## 1. Problem

The current ranked tenancy metric is `overallGap`: for each unit listed 2+ times, the median number of months between successive **listing creation dates**, taken across an operator's repeat-listed units (gaps clamped to [1, 60] months). It is 30% of the composite rank.

Two structural flaws, both surfaced in QA on the Shannon (Houston) and Nashville scorecards:

1. **It over-counts rapid re-listing as turnover.** A listing that falls through and is re-advertised a few weeks later produces a tiny gap that reads as a fast turnover. In Nashville, ~47% of measured gaps are under 6 months — most of those are re-posts, not real tenant departures. This drags stickiness estimates down and makes stable operators look churny.

2. **It ignores every unit that hasn't turned over yet.** Only units listed 2+ times contribute. In a 5-year data series where the average US tenancy is ~5 years (22% of renters move annually), the majority of units have not turned over and *have not had the chance to*. Nashville: 62–72% of units are never counted. The metric describes only the subset that already left — a survivorship-biased view of churn, not retention.

The correct signal (Jonas): **sequential leasing — do tenants stay past the first lease?** A completed ~12-month lease is the baseline, not an accomplishment ("if somebody is only holding on to someone for twelve months, that's generally a single lease term"). The meaningful signal is **renewal**: staying **24+ months** means the tenant renewed past the first lease at least once.

## 2. Approach: Kaplan-Meier survival on occupied intervals

Model each unit's **occupied interval** (the time a unit sits off-market between two listings = a tenancy) as a survival observation:

- **Event (turnover observed):** unit was listed, closed, then re-listed. Duration = `next_creation − prev_deactivation` in months. This is the length of the tenancy that just ended.
- **Right-censored (still occupied):** unit's most recent listing has closed and it has **not** re-listed as of the data-as-of date. Duration = `DATA_AS_OF − last_deactivation`. The tenancy is ongoing; we only know it has lasted *at least* this long. **This is the fix for flaw #2** — units that haven't turned over become censored observations instead of being dropped.
- **Re-post floor (fix for flaw #1):** an occupied interval shorter than **3 months** is treated as a re-post (fell-through listing re-advertised), not a real turnover, and is **dropped entirely** — it is neither an event nor a censored observation.

Kaplan-Meier combines events and censored observations into a retention curve `S(t)` = probability a tenancy lasts at least `t` months. The ranked metric is **`S(24)` — 24-month retention** ("share of tenancies that reach two years").

**Why this is honest.** Retention-at-a-fixed-horizon is only estimable when enough units were observed long enough to reach that horizon. Operators with a short observation window (or too few long-observed units) genuinely cannot support a 24-month estimate. Rather than fabricate one, we **suppress and reweight** (see §5), exactly as rent-stability and community-visibility already do.

### Validation already performed (Nashville, MSA 34980)

Read-only KM scripts on merged Nashville data confirmed the model:
- Current `overallGap` median tenancy: **7.2 months** (implausibly low — the laugh-test failure).
- KM median tenancy (floor 3mo): **30.7–36.3 months**, using the 62–66% of units that are censored (still-occupied).
- `S(24)` spreads operators meaningfully (31%–91%) where `S(12)` is compressed (55%–96%) — 24mo discriminates, 12mo does not.
- `corr(KM median, S(24)) = 0.86` among operators where both exist — the retention headline tracks the underlying curve.
- **UDR** (2.5-year window) has `at-risk@24mo = 183`, `at-risk@36mo = 0` — it qualifies at 24 months but not 36, which is why 24mo is the right horizon and why the gate must be at-risk-based, not age-based.

## 3. Observation-window reality (all 34 markets, from the seed)

Across 4,072 ranked operators, `coverage.yearsVisible`:

| Window | operators | share |
|---|---|---|
| < 1.5 yr | 957 | 24% |
| 1.5–2 yr | 208 | 5% |
| 2–3 yr | 559 | 14% |
| 3–4 yr | 287 | 7% |
| ≥ 4 yr | 2,061 | 51% |

Median window 4.1 yr. **~29% have < 2 years** (cannot support 24-month retention at all); ~51% have ≥ 4 years (solid). This is the population the gate must sort.

## 4. Computation (pipeline: `compute_tenancy` rewrite)

`tenancy_episodes[uru]` already holds `(creation_time, deactivation_time)` per lifetime listing (pipeline.py:630). `NOW` already equals the market's `DATA_AS_OF` (pipeline.py:132–133). No new ingestion is required.

### 4.1 Build survival observations per operator

```
FLOOR_MONTHS = 3.0
MONTH = 30.44

observations = []            # list of (duration_months, event)  event: 1=turnover, 0=censored
for uru, episodes in d["tenancy_episodes"].items():
    eps = sorted(episodes, key=lambda x: x[0])          # by creation_time
    for i in range(1, len(eps)):
        prev_deact = eps[i-1][1]
        curr_creation = eps[i][0]
        if prev_deact and curr_creation and curr_creation > prev_deact:
            dur = (curr_creation - prev_deact).days / MONTH
            if dur >= FLOOR_MONTHS:
                observations.append((dur, 1))            # real turnover; <FLOOR dropped as re-post
    last_deact = eps[-1][1]
    if last_deact:                                        # last listing closed, not re-listed → occupied
        dur = (NOW - last_deact).days / MONTH
        if dur >= 0:
            observations.append((dur, 0))                # censored (still occupied)
    # last listing still OPEN (deactivation is None) → unit is on-market/vacant → no observation
```

No upper clamp: the horizons (12/24/36) bound what we read from the curve; a genuine 40-month occupied interval is a real long tenancy.

### 4.2 Kaplan-Meier estimator

```
def km_curve(observations):
    event_times = sorted(set(t for t, e in observations if e == 1))
    S = 1.0; curve = []
    for t in event_times:
        n_at_risk = sum(1 for d, _ in observations if d >= t)
        n_events  = sum(1 for d, e in observations if e == 1 and abs(d - t) < 1e-9)
        if n_at_risk > 0:
            S *= (1 - n_events / n_at_risk)
        curve.append((t, S))
    return curve

def retention_at(curve, h):          # S(h): last S at an event time <= h; 1.0 if no event <= h
    s = 1.0
    for t, sv in curve:
        if t <= h: s = sv
        else: break
    return s

def km_median(curve):                # first t where S(t) <= 0.5; None if never reached in-window
    return next((t for t, sv in curve if sv <= 0.5), None)

def at_risk(observations, h):        # observations (event or censored) lasting >= h
    return sum(1 for d, _ in observations if d >= h)
```

### 4.3 Derived tenancy values

```
curve          = km_curve(observations)
retention12    = round(retention_at(curve, 12) * 100, 1)     # 0–100
retention24    = round(retention_at(curve, 24) * 100, 1)
retention36    = round(retention_at(curve, 36) * 100, 1)
kmMedianMonths = km_median(curve)                            # float | None
atRisk24       = at_risk(observations, 24)
turnoverEvents = sum(1 for _, e in observations if e == 1)

QUALIFY_MIN_ATRISK24 = 25                                    # tunable; validated in the audit (§8)
qualified = atRisk24 >= QUALIFY_MIN_ATRISK24
```

- **`retention24Pct`** = `retention24` when `qualified`, else `None`. This is the ranked value.
- **Legacy fields preserved unchanged** (`overallGap`, `multiEpisodePct`, `multiEpisodeUnits`, `house`, `apartment`) so Classic + PDF + the vacancy signal keep working (§6). `compute_tenancy` emits both the legacy block and the new fields.

### 4.4 New keys on the tenancy block

Added to the dict `compute_tenancy` returns (and passed through `merge.py` to the seed):

| key | type | meaning |
|---|---|---|
| `retention24Pct` | number \| null | ranked metric: % of tenancies reaching 24 months; null when unqualified |
| `retentionCurve` | `{m12, m24, m36}` | full curve (percentages), always emitted for context |
| `kmMedianMonths` | number \| null | median tenancy in months where the curve reaches 50%, else null |
| `atRisk24` | int | # observations lasting ≥ 24 months (the gate's basis) |
| `turnoverEvents` | int | # turnover events (audit/context) |
| `tenancyQualified` | bool | `atRisk24 >= QUALIFY_MIN_ATRISK24` |
| `tenancySuppressed` | bool | `not tenancyQualified` |
| `tenancySuppressedReason` | string \| null | e.g. `"Too early to assess renewal — this operator has been tracked 1.4 years."` (uses `years_visible`) |

## 5. Ranking, star, composite (pipeline)

- **Metric value** (pipeline.py:1025): `metric_values["tenancy"][norm] = feats["tenancy_block"]["retention24Pct"]` (was `overallGap`). `None` for unqualified operators.
- **Direction:** higher retention = better → the existing ascending percentile branch (`percentile_for_metric`, the non-`dom` path) is already correct. No direction change.
- **Percentile & star:** `tenancyPercentile` and `ten_star` now rank retention24 within the 7-cell cohort. Unqualified operators get `None` percentile (they aren't in `metric_values["tenancy"]`), so they receive no tenancy star — correct.
- **Composite reweight — no new code.** `compute_composite` already sums only non-`None` metric percentiles and divides by `w_used` (pipeline.py:1137–1143). When `tenancy` is `None`, its 0.30 weight is dropped and the composite renormalizes across the remaining metrics automatically. This is the suppress-and-reweight rail, identical to how CV suppression already flows.
- **Weighting-scheme label:** extend the human-readable `weightingScheme` string (pipeline.py:1779) to note when tenancy is suppressed/redistributed, mirroring the existing CV note (`"...(CV suppressed; redistributed)"`).
- **Weight unchanged:** tenancy stays 0.30 for qualified operators (`WEIGHTS_FULL` / `WEIGHTS_NO_CV` unchanged).

## 6. The `overallGap` → vacancy-signal dependency (kept, legacy)

`lending-signals.ts:computeVacancyPct` uses `sc.tenancy.overallGap` (months) as the occupancy-length input to `vacancy_pct = domMonths / (tenancy + domMonths)`. Vacancy renders **only** in `ClassicScorecardBody.tsx` (opt-in, being retired) and `OperatorProfilePDF.tsx` — **not** in the New default scorecard.

**Decision for v1:** keep `overallGap` computed exactly as today and keep it feeding the vacancy signal unchanged. This holds Classic + PDF behavior constant and keeps the change focused on the headline metric. When Classic is retired, the vacancy signal retires with it (or is repointed to `kmMedianMonths`); tracked as follow-up, out of scope here.

## 7. TypeScript surface changes

### 7.1 Types (`src/lib/types.ts`)
Add to the `tenancy` block: `retention24Pct: number | null`, `retentionCurve?: {m12: number; m24: number; m36: number}`, `kmMedianMonths?: number | null`, `atRisk24?: number`, `turnoverEvents?: number`, `tenancyQualified?: boolean`, `tenancySuppressed?: boolean`, `tenancySuppressedReason?: string | null`. Keep all existing legacy fields.

### 7.2 New scorecard display (`view-model.ts` + `operating-detail.ts`)
- Label stays **"Tenant retention"** (`view-model.ts:126`).
- Value: `${Math.round(retention24Pct)}% stay 2+ yrs` when qualified; when suppressed, the card renders the caveat (`tenancySuppressedReason`), not a value — mirror `rentStabilityDetail`'s null path (interpretation `""`, caveat rendered by the card).
- Benchmark: `cohort ${Math.round(cohortMedianRetention24)}%`.
- Interpretation (facts-not-judgments): `About ${round(retention24)}% of ${name}'s tenancies reach two years, versus a ${round(cohortMed)}% cohort median.`
- **Cohort median retention24** replaces `tenancyCohortMedianMonths`: compute in the peer pool (mirror `view-model.ts:432–437`) as the median of `retention24Pct` across **qualified** cohort members (`retention24Pct != null`).
- No rank/composite ever surfaced (HARD constraint preserved).

### 7.3 Other consumers to update
- `peer-comparison.ts:45` — return `retention24Pct` (was `overallGap`) so peer tables rank on the new metric; skip null (unqualified) members.
- `metric-definitions.ts:183` region — rewrite the tenancy definition to describe 24-month retention.
- `ask-tools.ts:435` — add `tenancyRetention24Pct` (and keep `tenancyMultiEpisodePct`) to the Ask-AI payload; ensure no rank/composite leaks (per the prior Ask-AI leak fix).
- **Watch-list** (`watch-list/scoring.ts`, `evaluator.ts`, and fixtures) consume a `tenancy.medianTenancy` field — audit these and repoint to `retention24Pct` (or map it) so alerts/scoring use the new metric. Confirm exact field wiring during implementation.
- `stars.ts:17` comment — tenancy star now = 24-month retention.

## 8. Migration & verification

1. **Re-run pipeline** across all 34 markets (per-market `pipeline.py`), then `normalize → merge.py` to regenerate the seed. Do **not** `prisma db seed` locally — re-seed happens on deploy.
2. **Before/after rank audit** (scratchpad, read-only over the two seeds):
   - How many operators change composite rank, and by how much (distribution).
   - Suppression count/rate — expect ~29% (the `<2yr` population); confirm the *right* operators are suppressed (young/small), and that established large operators (e.g. UDR via `atRisk24=183`) remain qualified.
   - Distribution of `retention24Pct` and `kmMedianMonths`; sanity vs the Nashville validation (median tenancy in the 30s of months, not ~7).
   - Flag any qualified operator with `retention24Pct == 100 & turnoverEvents == 0` for manual inspection (possible off-platform-churn artifact; bounded by the eligibility/recent-activity filter, but worth eyeballing).
   - Sensitivity of the suppression count to `QUALIFY_MIN_ATRISK24 ∈ {20, 25, 30}`; confirm 25 before locking.
3. **tsc + full test suite green**; update/extend view-model, operating-detail, peer-comparison, watch-list tests for the new field and the suppressed path.
4. **Screenshot** New scorecards via the `/dev/scorecards/[slug]?view=new` harness for a qualified operator and a suppressed operator; confirm the retention headline and the caveat render correctly.
5. Commit + PR; re-seed triggers on merge.

## 9. Assumptions & limits (documented, accepted)

- **"Still occupied" = closed listing not re-listed.** We cannot distinguish a genuinely occupied unit from one whose operator stopped listing on Dwellsy or sold it. The eligibility filter (recent T12 activity) bounds the fully-dark case; documented as an on-platform-observed retention measure.
- **Re-post floor is a heuristic** (3 months). Intervals below it are dropped; a real ultra-fast turnover is rare and not worth the false positives from re-posts.
- **Horizon fixed at 24 months** as the renewal signal. 12mo is emitted for context but never ranked (baseline lease, no accomplishment). 36mo is emitted for context; too few operators support it as a headline.

## 10. Out of scope

- Repointing the vacancy signal off `overallGap` (deferred to Classic retirement).
- Shrinkage/partial-pooling of thin 2–3yr estimates toward the cohort (revisit only if the audit shows the 2–3yr band's `retention24Pct` is jumpy; the at-risk gate is the v1 mechanism).
- Tenancy #2 (lease-up vs vacancy wording) and rent-stability suppression-message clarity — separate backlog items.
