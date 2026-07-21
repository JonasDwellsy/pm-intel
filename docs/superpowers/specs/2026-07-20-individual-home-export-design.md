# Individual-Home Export (Property Detail Phase 2) — Design Spec

**Date:** 2026-07-20
**Status:** Approved for planning
**Goal:** Let an entitled user export the **individual scattered-SFR homes** an operator manages (address + core per-home observations), as a new sheet on the existing Properties export — the fine grain Phase 1 deliberately rolled up.

---

## 1. Problem & context

Phase 1 (property-level detail) surfaces per-operator **rollups**: MF per-concentrated-community, and scattered SFR **per submarket** (`sfr-submarket` records carry `homes` as a *count* + medians; the individual addresses are aggregated away). For an asset manager doing portfolio due diligence (the prospective client's use case), seeing the *actual homes* an operator runs is the next step. Phase 2 itemizes those homes.

**Why "with data migration":** the per-home addresses exist only in the pipeline **source listings** (the `merged_*` CSVs on the owner's Shared Drive) — not in the app. The pipeline resolves each listing → operator and has the address in its per-listing loop, then discards it at rollup. Phase 2 stands up a per-home data path the app can query.

**Volume (measured):** ~221,717 distinct homes across 3,258 operators; largest single operator (Progress Residential) = 2,802 homes; ~388k T12 listing events. Small for Postgres.

## 2. Approved architecture (brainstorm)

- **Source → store:** pipeline emits a per-home extract → a **Neon `PropertyHome` table**, read **on-demand** at export time. (Chosen over object storage: 222k rows is modest, and a table reuses the entire Prisma/Neon/entitlement stack with no new infra/credentials/ownership question.)
- **Export-only** (no in-app per-home table — it would be enormous).
- **Un-scored** (observations only — no per-home stars/percentiles; same statistical-integrity line as Phase 1).
- **Entitlement-gated** (reuses the existing export route's gate).
- **Coverage:** eligible operators only (matches the Phase 1 `propertyDetail` path).
- **Scope boundary:** MF communities stay per-community (already the finest useful grain in Phase 1). "Homes" itemizes the **scattered SFR** only. The full 15 GB source migration is a **separate** hygiene item — Phase 2 moves only the slim per-home extract.

## 3. Data model — `PropertyHome` (new Prisma model + migration)

```prisma
model PropertyHome {
  id             String    @id @default(cuid())
  // Per-market operator key — same key as Phase 1 propertyDetail / the scorecard.
  pmSlug         String
  marketId       String
  // Source address identity (stable dedup key) + display string.
  addressId      String
  address        String
  submarket      String?
  latitude       Float?
  longitude      Float?
  bedrooms       Int?
  bathrooms      Float?
  // Per-home observations over T12 (aggregated across the home's listing
  // events). Un-scored — no stars/percentiles.
  medianRentT12  Int?
  domT12         Int?       // days-on-market, median across the home's events
  lastListedDate DateTime?
  nListings      Int        // T12 listing events for this home
  concession     Boolean    @default(false)  // any T12 listing advertised a concession
  createdAt      DateTime   @default(now())

  // One row per home per operator; enables idempotent upsert on re-load.
  @@unique([pmSlug, addressId])
  @@index([pmSlug])
}
```

**Grain / dedup:** one row per distinct home per operator, keyed on the source `address1_id` (`addressId`). A home's multiple T12 listing events aggregate into that single row (median rent/DOM, latest date, event count, any-concession) — mirrors the `merge_listings` dedup-newest-wins pattern. `pmSlug` is the per-market operator (a home managed by the same company in two markets appears under each market's operator — consistent with the per-market scorecard).

## 4. Generation — pipeline emits the per-home extract

The per-listing loop in `scripts/data-pipeline/pipeline.py` already: resolves each listing → operator (`eff_id`/norm), tracks `address1_id` + the `address_t12` set, and classifies concessions. Add a **per-home collector** alongside the existing SFR-submarket bucket population: for each eligible operator, key by `addressId` and accumulate `{address, submarket, lat, lon, bedrooms, bathrooms, rent[], dom[], listed dates, concession, nListings}` from that operator's scattered-SFR listings (the same listings that feed the `sfr-submarket` rollup — MF-community listings are excluded, matching the scope boundary).

Emit a slim extract to the pipeline output dir (owner's machine), one record per home:
`property_homes.jsonl` — `{pmSlug, marketId, addressId, address, submarket, latitude, longitude, bedrooms, bathrooms, medianRentT12, domT12, lastListedDate, nListings, concession}`.

**Not committed to the repo** (222k rows; DB data, like `OperatorSnapshot`). It's a pipeline artifact the loader reads locally.

## 5. Load — `load_property_homes.ts` (owner-run, trajectory-backfill pattern)

New `scripts/load-property-homes.ts` (mirrors `scripts/backfill-trajectory.ts`):
- Reads `property_homes.jsonl` from the pipeline output dir (path via env, like `IQ_DATA_DIR`).
- **Upserts** `PropertyHome` rows to Neon in batches (upsert on `@@unique([pmSlug, addressId])` so a re-run REFRESHES, not duplicates — exactly the backfill idempotency pattern).
- `--reset` deletes rows for the loaded operators first (stale-home cleanup on re-load).
- Run directly with DB env set (`DATABASE_URL`), same as the backfill/classifier. NOT in `vercel-build` — it's a data step, refreshes when the owner runs it.

## 6. Export — add a "Homes" sheet

- `src/lib/scorecard/property-export.ts` — add `buildHomesSheet(homes: PropertyHomeRow[])` and append it as a second sheet **"Homes"** in `buildPropertyWorkbook` (keep the existing "Properties" rollup sheet). Columns: Address, Submarket, Beds, Baths, Median Rent (T12), DOM, Last Listed, # Listings, Concession. Un-scored.
- `src/app/api/scorecard/[slug]/properties/route.ts` — after the existing entitlement gate + `parseScorecard`, also `prisma.propertyHome.findMany({ where: { pmSlug: slug }, orderBy: [{ submarket: "asc" }, { address: "asc" }] })` and pass the rows into `buildPropertyWorkbook`.
  - The **entitlement gate is unchanged** (the same `resolveViewerEntitlement()` / `isMarketEntitled()` / 404-not-403 as the PDF route — the only gate the export goes through).
  - **404 semantics:** keep the current "nothing to export" 404 only when **both** `propertyDetail` is absent AND there are zero `PropertyHome` rows. If `propertyDetail` exists but homes are empty (not yet loaded), export the Properties sheet alone — the Homes sheet is additive.
- No in-app UI change; the existing "Export" button already hits this route.

## 7. Guardrails & honesty

- **Un-scored:** `PropertyHome` carries no star/percentile/rank; the Homes sheet is descriptive.
- **Address exposure:** individual home addresses are more sensitive than rollups — the export's entitlement gate (only entitled orgs, in purchased markets) is the control; no new public surface. Homes are never rendered in-app or on `/sample`.
- **Coverage caveat:** eligible operators only; homes reflect Dwellsy-observed T12 listings, not a title-record portfolio — a per-home caveat line in the sheet header, consistent with Phase 1's "descriptive, not scored / observed listings" framing.

## 8. Testing strategy

- **Python** `test_property_detail.py` (extend) or a new `test_property_homes.py`: pure per-home aggregation — multiple listing events for one `addressId` collapse to one record with median rent/DOM, latest date, `nListings` = event count, `concession` = any-true; MF-community listings excluded.
- **TS** `property-export.test.ts` (extend): `buildHomesSheet` column order + values; `buildPropertyWorkbook` emits both sheets when homes present, Properties-only when homes empty; un-scored (no score columns).
- **TS** loader: a pure `parsePropertyHomeRecord` / row-mapper unit-tested; the DB upsert path is exercised manually on load (mirrors backfill — not unit-tested against Neon).
- **Route:** existing entitlement tests cover the gate; add a case that a homes-present operator yields a 2-sheet workbook and a homes-absent-but-propertyDetail-present operator yields a 1-sheet workbook (200, not 404).

## 9. Rollout

1. Land code (schema + migration, pipeline collector, loader, export sheet, tests). Migration adds an empty `PropertyHome` table on deploy — the export degrades cleanly (no Homes sheet) until data lands.
2. Owner runs the pipeline (emits `property_homes.jsonl`) → runs `load-property-homes.ts` → `PropertyHome` populated in Neon.
3. Export's Homes sheet goes live for entitled users. No reseed of the scorecard blob needed (PropertyHome is a separate table; `scorecardData` unchanged).

## 10. Deferred / out of scope

- Full 15 GB pipeline-source migration off the owner's laptop (separate hygiene item).
- Cross-market (canonical) aggregation of homes into the operator-rollup page.
- Any in-app per-home view / map.
- Per-home rent history / full event log (this is a per-home T12 summary, not a rent roll).

## 11. Risks

- **Source field availability:** beds/baths/coords may be sparse in the source listings — all nullable; the sheet shows blanks where absent. Address + rent/DOM/date are the reliable core.
- **Pipeline coupling:** the collector runs inside the existing per-listing loop, so it ships with a pipeline change and populates on the next full pipeline run (heavy, like the Phase 1 data step) — acceptable; it's a data-refresh operation, not per-deploy.
- **Address quality:** messy/duplicate source addresses dedup on `addressId` (stable ID), not the string, so display duplicates are avoided.
