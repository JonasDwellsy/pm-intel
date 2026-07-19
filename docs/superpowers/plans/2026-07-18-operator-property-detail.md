# Operator Property-Level Detail + Rollup Export (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each operator a property-level detail view + rollup export one grain below the scorecard — MF per-community, scattered-SFR per-submarket — as descriptive observations + MSA-median comps (no per-property scores), derived by a new pipeline aggregation pass and carried in the existing `scorecardData` blob (no schema change).

**Architecture:** A pure Python builder (`property_detail.py`) turns per-property listing buckets into records; `pipeline.py` populates those buckets in its existing per-listing loop, computes MSA-median comps once per market, and emits a `propertyDetail` block into each operator's `pm_out`. The TS side adds an optional `ScorecardData.propertyDetail`, a scorecard "Properties" section, and an xlsx export at the same granularity. Data appears after a pipeline re-run + reseed; the section omits cleanly when the block is absent.

**Tech Stack:** Python 3 pipeline (pytest, mirrors `marketing.py`/`tenancy_survival.py`), Next.js/React/TS, Vitest components, node:test for TS libs, `@react-pdf`/xlsx export machinery (`src/lib/watch-list/export.ts` pattern).

## Global Constraints

- **No schema/migration.** `propertyDetail` is a new optional field on `ScorecardData` (`PM.scorecardData` JSON blob); reseeds on deploy via the existing `isDataCurrent()` fingerprint. Never write Neon manually.
- **Data + comps, never scores.** Property records carry raw observations + the MSA-median comp; NO star/score/percentile per property. Operator-level scoring is untouched.
- **Grain:** MF → one record per *concentrated* community (≥10 T12 URUs, matching `perCommunity`/`ELIG_BIG_COMM_MIN` usage at pipeline.py:872). Scattered SFR (listings with no community or a sub-concentration community) → one record per submarket (city slug). Individual per-home rows are **Phase 2** — out of scope.
- **Record shape (camelCase, emitted by the builder, mirrored in TS):**
  ```ts
  propertyDetail?: {
    properties: Array<{
      kind: "community" | "sfr-submarket";
      label: string;              // community name | submarket display name
      submarket: string | null;   // city slug (both kinds carry it when known)
      units: number | null;       // MF: top_down_community_count; null for SFR
      homes: number | null;       // SFR rollup: distinct homes; null for MF
      nListings: number;          // T12 listings backing this record
      medianDomT12: number | null;
      medianRentT12: number | null;
      rentYoY: number | null;     // raw median-rent T12 vs prior-year; observation, NOT mix-adjusted
      concessionRate: number | null;
      listingQuality: number | null;
    }>;
    comps: {                       // MSA-median reference ("vs market")
      medianDomT12: number | null;
      medianRentT12: number | null;
      rentYoY: number | null;
      concessionRate: number | null;
    };
  };
  ```
- **rentYoY caveat:** per-property rentYoY is a raw median-rent delta (T12 vs T24→T12), explicitly NOT the operator metric's mix-adjusted YoY — surfaced as an observation with a methodology note, never a score.
- **Coverage:** attach `propertyDetail` to every operator that gets a full `pm_out`. Task 2 confirms whether that's the eligible set only or includes tracked-tier operators; if eligible-only, note it (tracked-tier coverage is a Phase-1.5 follow-up) — do NOT silently drop the thin-market rationale.
- **Entitlement/auth:** the Properties section + export ride the scorecard's existing gate; no new authz.
- **CI gate:** `pytest scripts/data-pipeline/` (pipeline) + `npx tsc --noEmit` + `npm run test:watch-list` + `npm run test:components`.

---

## File Structure

- **Create** `scripts/data-pipeline/property_detail.py` — pure `build_property_detail(buckets, comps)` + helpers.
- **Create** `scripts/data-pipeline/test_property_detail.py` — pytest.
- **Modify** `scripts/data-pipeline/pipeline.py` — per-community/per-submarket buckets in the streaming loop; per-market comps; call the builder; emit `propertyDetail` in `pm_out`.
- **Modify** `src/lib/types.ts` — `ScorecardData.propertyDetail` (shape above).
- **Modify** `prisma/seed.ts` (+ `src/lib/scorecard/parse.ts` if it whitelists fields) — pass `propertyDetail` through untouched.
- **Create** `src/lib/scorecard/property-detail-view.ts` (+ `.test.ts`) — pure projector: record → row VM with value/comp pairs + delta sign.
- **Create** `src/components/scorecard/PropertyDetailSection.tsx` (+ `.test.tsx`) — the sortable section.
- **Modify** the scorecard body (`src/components/scorecard/ScorecardBody.tsx` or the New-scorecard section list — Task 4 locates it) — mount the section.
- **Modify** `src/components/scorecard/MethodologyFooter.tsx` — one-line property-view note.
- **Create** `src/lib/scorecard/property-export.ts` (+ `.test.ts`) — xlsx builder.
- **Create** `src/app/api/scorecard/[slug]/properties/route.ts` — export download route (mirror the scorecard PDF route).
- **Create** `src/components/scorecard/PropertyExportButton.tsx` — client download trigger.

---

## Task 1: Pure property-detail builder (`property_detail.py`)

**Files:** Create `scripts/data-pipeline/property_detail.py`, `scripts/data-pipeline/test_property_detail.py`.

**Interfaces:**
- Produces:
  ```python
  # buckets: per-operator, already split by the caller (pipeline.py):
  #   communities: dict[cid] -> {"label","units","dom":[...],"rent_t12":[...],
  #       "rent_prior":[...],"concession_hits":int,"n_listings":int,
  #       "marketing":[<per-listing marketing dicts>], "submarket":str|None}
  #   sfr_by_submarket: dict[submarket_slug] -> same value shape minus units,
  #       plus "homes": int, "label": submarket display name
  # comps: {"medianDomT12","medianRentT12","rentYoY","concessionRate"} (MSA medians)
  def build_property_detail(communities: dict, sfr_by_submarket: dict, comps: dict) -> dict | None
  ```
  Returns the `propertyDetail` dict (`{"properties":[...], "comps":comps}`) or `None` when there are no property records.

- [ ] **Step 1: Write failing tests** (`test_property_detail.py`, pytest; mirror `test_marketing.py`).

```python
from property_detail import build_property_detail

def _mk_comm(**kw):
    base = {"label":"Oak Ridge","units":120,"dom":[20,22,24],"rent_t12":[1480,1500],
            "rent_prior":[1440],"concession_hits":0,"n_listings":3,
            "marketing":[{"amenities_n":5,"desc_len":800,"distinct_words":120,
                          "content_cats":4,"photos_n":12}],"submarket":"chattanooga-tn"}
    base.update(kw); return base

def test_mf_community_record_has_median_dom_rent_and_no_score():
    out = build_property_detail(
        communities={"c1": _mk_comm()}, sfr_by_submarket={},
        comps={"medianDomT12":29,"medianRentT12":1520,"rentYoY":0.01,"concessionRate":0.17})
    assert out is not None
    p = next(r for r in out["properties"] if r["kind"] == "community")
    assert p["label"] == "Oak Ridge"
    assert p["units"] == 120
    assert p["medianDomT12"] == 22           # median([20,22,24])
    assert p["medianRentT12"] == 1490        # median([1480,1500])
    assert p["nListings"] == 3
    assert "score" not in p and "star" not in p and "percentileRank" not in p
    assert out["comps"]["medianDomT12"] == 29

def test_sfr_submarket_rollup_uses_homes_and_null_units():
    out = build_property_detail(
        communities={},
        sfr_by_submarket={"mesa-az": {"label":"Mesa","homes":40,"dom":[31,29],
            "rent_t12":[2150,2100],"rent_prior":[2200],"concession_hits":1,
            "n_listings":2,"marketing":[],"submarket":"mesa-az"}},
        comps={"medianDomT12":33,"medianRentT12":2000,"rentYoY":-0.02,"concessionRate":0.1})
    p = next(r for r in out["properties"] if r["kind"] == "sfr-submarket")
    assert p["units"] is None and p["homes"] == 40
    assert p["concessionRate"] == 0.5        # 1 hit / 2 listings
    assert p["rentYoY"] is not None          # median(2125) vs 2200

def test_empty_returns_none():
    assert build_property_detail({}, {}, {"medianDomT12":None,"medianRentT12":None,
                                          "rentYoY":None,"concessionRate":None}) is None
```

- [ ] **Step 2: Run, verify fail.** `cd scripts/data-pipeline && python -m pytest test_property_detail.py -q` → fail (no module).

- [ ] **Step 3: Implement `property_detail.py`.** Pure functions only (no I/O). For each community and each SFR submarket bucket, compute a record: `medianDomT12 = median(dom) or None`, `medianRentT12 = median(rent_t12) or None`, `rentYoY = (median(rent_t12)-median(rent_prior))/median(rent_prior)` rounded, or None when either side empty, `concessionRate = concession_hits / n_listings` (None if n_listings 0), `listingQuality = marketing.compute_marketing(marketing)` (import from `marketing.py`; None if no marketing dicts), `nListings`, plus identity (`kind`, `label`, `submarket`, `units`/`homes`). Sort `properties` by `nListings` desc then `label`. Return `None` if no properties. Round rents to whole dollars, rates to 3 dp, DOM to 1 dp, matching existing pipeline rounding.

- [ ] **Step 4: Run, verify pass.** `python -m pytest test_property_detail.py -q` → pass.

- [ ] **Step 5: Commit.**
```bash
git add scripts/data-pipeline/property_detail.py scripts/data-pipeline/test_property_detail.py
git commit -m "feat(pipeline): pure property-detail builder (MF community + SFR submarket records)"
```

---

## Task 2: Wire the builder into `pipeline.py`

**Files:** Modify `scripts/data-pipeline/pipeline.py`.

**Interfaces:** Consumes `build_property_detail` (T1). Produces `pm_out["propertyDetail"]`.

- [ ] **Step 1: Add per-property buckets to the operator accumulator.** In the per-operator `d` init (near line 464 where `comm_urus_t12`/`comm_tdc` are initialized), add: `comm_dom`, `comm_rent_t12`, `comm_rent_prior`, `comm_concession`, `comm_marketing`, `comm_label` (dict[cid]→...) and `sfr_dom`, `sfr_rent_t12`, `sfr_rent_prior`, `sfr_concession`, `sfr_marketing`, `sfr_homes`, `sfr_label` (dict[submarket_slug]→...). Use `defaultdict(list)` / `defaultdict(int)` / `{}` as appropriate.

- [ ] **Step 2: Populate them in the existing per-listing T12 block** (inside `if in_t12(...)`, lines 656-712, where `cid`, `aid`, `addr_city_slug`, `rent`, `dom_days`, concession match, and the marketing dict are already computed). Route each listing to a community bucket (`cid` present) or the SFR submarket bucket (`addr_city_slug`), appending dom_days/rent/marketing, counting concession hits, tracking homes (`aid`) for SFR and the community label/units. In the existing `in_t24_t12` block (714), append prior-year rent to `comm_rent_prior[cid]` / `sfr_rent_prior[submarket]`. (Whether a `cid` is a *concentrated* community is decided at build time in Step 4, not here.)

- [ ] **Step 3: Compute per-market comps once.** After the streaming loop, before the per-operator emit loop, compute MSA medians across all this market's T12 listings: `medianDomT12` (reuse the market's existing median-DOM if already computed; else median of all operators' `dom_t12_*`), `medianRentT12`, market `concessionRate`, and market `rentYoY` (median T12 rent vs median prior-year rent). Store as a `market_comps` dict.

- [ ] **Step 4: Build + emit in the `pm_out` assembly** (near line 1888, alongside `coverageMapPoints`). For the operator, split its community buckets into concentrated (≥10 T12 URUs via `comm_urus_t12`, matching line 872) → MF community records, and fold non-concentrated communities' listings into the SFR submarket buckets. Call `build_property_detail(concentrated_communities, sfr_by_submarket, market_comps)` and, when non-None, set `pm_out["propertyDetail"] = <result>`. Confirm which operators reach this emit (eligible-only vs all); if a separate tracked-tier emit exists, attach there too or note the coverage gap in the report.

- [ ] **Step 5: Verify.** Run the pipeline test suite `cd scripts/data-pipeline && python -m pytest -q` (all green). If a small market fixture / smoke exists, run it and confirm a sample `pm_out` has a well-formed `propertyDetail`; otherwise add a minimal integration assertion. Report which operator set gets `propertyDetail`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(pipeline): emit per-operator propertyDetail (community + SFR-submarket records + MSA comps)"
```

---

## Task 3: TS type + seed passthrough

**Files:** Modify `src/lib/types.ts`; `prisma/seed.ts`; `src/lib/scorecard/parse.ts` (only if it explicitly whitelists scorecard fields).

- [ ] **Step 1: Add `propertyDetail?` to `ScorecardData`** in `src/lib/types.ts` using the exact shape in Global Constraints (optional, nullable-safe).

- [ ] **Step 2: Seed passthrough.** Confirm `seed.ts` serializes the full scorecard object into `PM.scorecardData` (it stores the whole blob — `propertyDetail` rides along automatically). If `parse.ts` (or any zod/whitelist) drops unknown fields, add `propertyDetail` so it survives parse. Add a 1-line comment.

- [ ] **Step 3: Verify.** `npx tsc --noEmit` → 0. (No runtime data yet — the field is optional; existing seeds lack it and still parse.)

- [ ] **Step 4: Commit.**
```bash
git add src/lib/types.ts prisma/seed.ts src/lib/scorecard/parse.ts
git commit -m "feat(scorecard): ScorecardData.propertyDetail type + seed passthrough"
```

---

## Task 4: Properties section (in-app) + view-model + methodology note

**Files:** Create `src/lib/scorecard/property-detail-view.ts` (+ `.test.ts`), `src/components/scorecard/PropertyDetailSection.tsx` (+ `.test.tsx`); modify the scorecard body section list + `MethodologyFooter.tsx`.

**Interfaces:** Consumes `ScorecardData.propertyDetail` (T3).

- [ ] **Step 1: Pure projector + test.** `property-detail-view.ts`: `projectPropertyRows(propertyDetail): PropertyRowVM[]` — one VM per property with, for each comparable metric, `{ value, comp, deltaSign: "better"|"worse"|"neutral"|null }` (DOM lower=better; concession lower=better; rentYoY higher=better; rent level = neutral/no delta). node:test asserts the delta-sign logic and null handling. Never emit a score.

- [ ] **Step 2: Failing component test** (`PropertyDetailSection.test.tsx`, Vitest+RTL): render with a `propertyDetail` fixture (1 community + 1 SFR-submarket) → asserts both rows render with value AND comp shown; a community shows units, an SFR row shows homes + "SFR · {submarket}"; sorting by DOM reorders; passing `undefined`/empty → renders nothing.

- [ ] **Step 3: Implement `PropertyDetailSection.tsx`.** A `LayerSectionHeader`-style section (match the scorecard's existing section components), a sortable table (property/community, units-or-homes, median DOM, rent + YoY, concession, quality) with each comparable cell showing its MSA-median comp inline (e.g. "22 · mkt 29") and a subtle better/worse tone from the VM. Include the `PropertyExportButton` (Task 5) in the header. Return null when `propertyDetail` is absent/empty.

- [ ] **Step 4: Mount in the scorecard body.** Add `<PropertyDetailSection scorecard={scorecard} />` to the New scorecard's section list (locate the body composition — likely `ScorecardBody.tsx` — and place it after the metric sections, before the methodology footer). Gate identically to the surrounding sections (no new auth). Do not render on the public `/sample` if the surrounding metric sections are hidden there — match their `publicSample` treatment.

- [ ] **Step 5: Methodology note.** In `MethodologyFooter.tsx` add one sentence: the property view is descriptive observations + MSA-median comps, intentionally un-scored (small per-property N), and per-property rentYoY is a raw median-rent delta (not the mix-adjusted operator metric); scattered SFR is shown as submarket rollups in this phase.

- [ ] **Step 6: Verify.** `npx tsc --noEmit` → 0; `npm run test:components` green (new tests + existing).

- [ ] **Step 7: Commit.**
```bash
git add src/lib/scorecard/property-detail-view.ts src/lib/scorecard/property-detail-view.test.ts src/components/scorecard/PropertyDetailSection.tsx src/components/scorecard/PropertyDetailSection.test.tsx src/components/scorecard/ScorecardBody.tsx src/components/scorecard/MethodologyFooter.tsx
git commit -m "feat(scorecard): Properties section (observations + MSA comps, no per-property scores)"
```

---

## Task 5: Rollup-granularity export

**Files:** Create `src/lib/scorecard/property-export.ts` (+ `.test.ts`), `src/app/api/scorecard/[slug]/properties/route.ts`, `src/components/scorecard/PropertyExportButton.tsx`.

**Interfaces:** Consumes `ScorecardData.propertyDetail`.

- [ ] **Step 1: Failing test** (`property-export.test.ts`, node:test mirroring `export.test.ts`): `buildPropertyWorkbook(scorecard)` produces a sheet whose header row = the property columns (Property/Community, Units, Homes, N Listings, Median DOM, Median Rent, Rent YoY %, Concession %, Listing Quality, + the market-comp columns), and one data row per property with the right values; comps present.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `property-export.ts`** using the same `xlsx`/`WorkSheet` machinery as `src/lib/watch-list/export.ts` (aoa_to_sheet + column widths). One row per property record + the MSA-comp columns. Filename `buildFilename(operatorName + "-properties", generatedAt)`.

- [ ] **Step 4: Download route + button.** `route.ts` (mirror `src/app/api/scorecard/[slug]/pdf/route.tsx`): auth + entitlement gate the same way the scorecard/PDF route does, load the PM's scorecard, 404 when no `propertyDetail`, else return the workbook as an `.xlsx` download. `PropertyExportButton.tsx`: a client button linking to that route (mirror `DownloadButton.tsx`).

- [ ] **Step 5: Verify.** `npx tsc --noEmit` → 0; `npm run test:watch-list` (node:test glob incl. the new export test) + `npm run test:components` green.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/scorecard/property-export.ts src/lib/scorecard/property-export.test.ts src/app/api/scorecard/[slug]/properties/route.ts src/components/scorecard/PropertyExportButton.tsx
git commit -m "feat(scorecard): property-detail xlsx export (rollup granularity) + download route"
```

---

## Task 6: Full gate + review + PR

- [ ] **Step 1: Full gate** — `cd scripts/data-pipeline && python -m pytest -q` → green; then `npx tsc --noEmit && npm run test:watch-list && npm run test:components` → green. If stale `.next/types/validator.ts` errors, `rm -f .next/types/validator.ts .next/dev/types/validator.ts` and re-run.
- [ ] **Step 2: No-scores audit** — grep the new property surfaces (`PropertyDetailSection`, `property-detail-view`, `property_detail.py`, `property-export`) to confirm no `star`/`score`/`percentile`/`rank` field is emitted or rendered per property.
- [ ] **Step 3: Coverage confirmation** — from Task 2's report, state which operators carry `propertyDetail` (eligible vs all) so Jonas knows the thin-market coverage reality before merge.
- [ ] **Step 4: Final whole-branch review** (opus) + address findings.
- [ ] **Step 5: Finish** — superpowers:finishing-a-development-branch → push + PR. **PR body MUST state:** shipping the code does not populate data — `propertyDetail` fills in only after a pipeline re-run against the source listings + reseed on deploy; the section/export omit cleanly until then. (Jonas merges via "merge N".)

---

## Self-Review (completed during planning)

- **Spec coverage:** persist lean per-property → T1/T2/T3; MF community + SFR submarket grain → T1/T2; data+comps, no scores → T1 (builder omits scores) + T4 (VM) + Step-2 audit; MSA-median comps → T2/T1; in-app section → T4; rollup export → T5; methodology note → T4; coverage=all-with-scorecard → T2 confirms + T6 reports; individual-home export explicitly Phase-2 (non-goal). All spec sections mapped.
- **Placeholders:** none — T1 has full tests + a specified builder; pipeline/UI/export tasks give exact anchors (pipeline.py line refs, pm_out emit site, export.ts pattern) + concrete test assertions. Two items deliberately confirmed in-task rather than guessed: the exact operator set reaching `pm_out` (T2 Step 4) and the scorecard body mount point (T4 Step 4).
- **Type consistency:** the `propertyDetail` record shape is defined once (Global Constraints), emitted camelCase by T1's builder, typed identically in T3, projected in T4, exported in T5. `rentYoY` is consistently the raw (non-mix-adjusted) median-rent delta everywhere, with the caveat carried into the methodology note.
