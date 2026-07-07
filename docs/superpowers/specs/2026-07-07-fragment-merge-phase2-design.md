# Within-Market Fragment Merge — Phase 2 (curated "possible" tier apply-path)

**Status:** Design approved (2026-07-07), pending spec review.
**Owner:** Jonas Bordo / Operator IQ
**Depends on:** Phase 1 (exact-tier auto-merge, PR #166, merged) — reuses its `operator_grouping` infrastructure.
**Scope:** the apply-path *only* — build the "offline pipeline is the single applier" half so human-curated merge decisions take effect in the seed. This is **enabling infrastructure**; the actual merges depend on someone curating the "possible" tier in the existing admin tool.

---

## 1. Problem / context

Phase 1 auto-merges the **exact** tier (identical normalized name, same market, no parent id). The **"possible"** tier — near-matches a human must judge (appended agent names, distinctive-subset token matches, e.g. "Jamie Bright, KRS Holdings" ⊃ "KRS Holdings") — is deliberately *not* auto-merged.

The curation surface is already built and permanent:
- `/admin/merges` (`merge-candidates.ts` + `MergeClusterCard`) surfaces "possible" clusters.
- `decideCluster` (admin action) writes `OperatorMergeDecision` rows: `{marketId, clusterKey, decision: "merge"|"dismiss", canonicalName, survivorSlug, memberSlugs[]}`. Its own comment states the intended architecture: *"records intent; the offline pipeline is the single applier (pools listings + recomputes)."*

**The gap = the applier.** Nothing reads those decisions or pools/recomputes, so a curated merge has no effect on the seed. Phase 2 builds that applier.

## 2. Architecture — the loop (freestanding, no Claude Code)

1. **Curate** — admin uses `/admin/merges` (existing web tool) → writes `OperatorMergeDecision`.
2. **Export** — a CLI script reads `OperatorMergeDecision` (via Prisma) and writes a committed `scripts/data-pipeline/merge_decisions.json`.
3. **Apply** — `pipeline.py` reads `merge_decisions.json` and pools/recomputes the merged operators (reusing Phase-1 grouping), on the next re-seed.
4. **Deploy** — commit the file + regenerated seed; `vercel-build` re-seeds prod.

Every step is a plain script, a web page, or a git push — no Claude Code. **Design bias (per Jonas):** the merge-apply *logic* stays self-contained and testable (in `operator_grouping.py`); the DB→file **export** is a thin bridge on the ingestion side, which will later be rewired to a live Dwellsy-DB connection — so it is intentionally *not* gold-plated. Guardrails are modest (a validation report), not a full hand-off harness.

## 3. Apply mechanic — `within_market_key` merge-map (reuses Phase 1)

A curated decision means: *"name-key B is the same operator as name-key A — fold B into A, display as `canonicalName`, keep `survivorSlug`."* (The "possible" tier is exactly operators whose Phase-1 name-keys **differ**.)

- Extend `operator_grouping.within_market_key(...)` with an optional **merge-map**: after computing an operator's normal key (parent-id → `name:<namekey>` → child-id), if that key is a *member* in a curated merge group for the market, return the group's **survivor key** instead. Member operators' raw rows then pool under one key and every metric recomputes over the union — identical to how the exact tier already works.
- **Display name:** for a merged group, the pipeline uses the decision's `canonicalName` (not the name-derived display).
- **Slug:** the merged operator keeps the decision's `survivorSlug` (URL stability for the surviving operator; the folded-in members' slugs disappear, same as Phase 1). The slug-assignment step honors the forced survivor slug.
- Keep it **pure + unit-tested** in `operator_grouping.py`, alongside `within_market_key` / `PLACEHOLDER_NAME_KEYS` / `load_do_not_merge`.
- Operates at the **name-key layer** — i.e. on no-parent operators (`name:<…>` keys). Parent-linked operators are already unified by parent-id and aren't merge candidates; the "possible" tier is by construction no-parent near-name-matches.

Precedence within `within_market_key`: parent-id (unchanged) → placeholder guard → do-not-merge → **curated merge-map remap** → normal name-key. (A do-not-merge entry wins over a merge — a curator wouldn't do both, but the guard is defined.)

## 4. Export — DB → `merge_decisions.json`

A CLI script `scripts/data-pipeline/export_merge_decisions.ts` (**tsx**, not Python — it uses the Prisma client to read the DB, then writes a JSON file the Python pipeline consumes; same split as `build-operator-universe.ts`):
- Reads all `OperatorMergeDecision` rows with `decision == "merge"` (dismiss rows are NOT exported — they only stop a cluster resurfacing in the admin tool; no data effect).
- **Resolves `memberSlugs` → grouping keys** against the *current committed seed* (`src/data/scorecard_data.json`): each member slug → its operator in the seed → that operator's name-key (`name_key(name)`); the survivor slug → the survivor key.
- Writes `merge_decisions.json` (committed, sorted for stable diffs).
- **Guard:** if a member slug can't be resolved in the current seed (renamed/gone), the export **skips that whole decision and logs a warning** — never a partial/mis-merge.
- Run against the same seed the decisions were curated against — which holds in the monthly loop (curate → export → re-run).

Prisma is the app's own ORM; a dev team runs this with DB creds they already have. (When the ingestion side is rewired to a live Dwellsy-DB connection, this export is one of the pieces that gets replaced — hence kept thin.)

## 5. File format — `merge_decisions.json`

```json
{
  "generatedAt": "2026-07-07T…Z",
  "decisions": [
    {
      "marketId": "phoenix-az",
      "survivorKey": "name:krsholdings",
      "canonicalName": "KRS Holdings",
      "survivorSlug": "krs-holdings",
      "memberKeys": ["name:krsholdings", "name:jamiebrightkrsholdings"]
    }
  ]
}
```
`pipeline.py` loads it into a per-market merge-map `{(marketId, memberKey) → {survivorKey, canonicalName, survivorSlug}}` (mirrors `load_do_not_merge`). `survivorKey` is included in `memberKeys` (the survivor maps to itself, carrying the canonicalName/slug).

## 6. Guardrails / validation (modest)

- The apply emits a **per-merge validation line** in the pipeline/merge log: market, canonicalName, # operators pooled, combined T12, resulting rank — a dev can eyeball it.
- `merge.py`'s existing acceptance-gate diff already reports the operator-count delta on re-seed; curated merges reduce the count by (members − 1) per decision, which shows there.
- Unresolvable-slug decisions are logged (see §4).

## 7. Interactions

- **Phase 1 (exact tier):** members of a curated merge are themselves Phase-1 name-groups; the merge-map remaps at the same name-key layer, so the two compose cleanly.
- **`do_not_merge.json`:** independent; precedence defined in §3.
- **`overallGap` / vacancy / rent stability:** untouched (rent stability is removed; vacancy unchanged).
- **URL stability:** survivor slug preserved; folded members' slugs 404 (acceptable — they weren't canonical entities).
- **Tenancy / all metrics:** recompute automatically over the pooled listings (they read the merged `pm_rich[norm]`), same as Phase 1.

## 8. Migration / verification

1. Build the module change + export script; unit-test `within_market_key` with a merge-map (member remaps to survivor; canonicalName applied; do-not-merge precedence; unknown key untouched).
2. With **no curated decisions yet**, `merge_decisions.json` is `{"decisions": []}` and the pipeline is a no-op — so this ships as a **zero-diff-to-seed** enabling change (no re-seed needed to merge the PR).
3. **End-to-end smoke test** (not requiring real curation): hand-write a one-entry `merge_decisions.json` for a known near-match pair in one market, run that market's pipeline to a scratch dir, confirm the two operators pool into one (survivor slug, canonicalName, combined T12, recomputed metrics), then revert the test file. Document the result.
4. `tsc` + full test suite green; the export script tsc-compiles / runs.
5. When real curation happens later: curate → export → re-run + audit → commit + deploy.

## 9. Out of scope (noted, not built here)
- **Admin "curated / pending / live" status indicator** — a useful robustness add (shows which decisions haven't reached the seed) and a small follow-up, but not required for the apply-path itself; deferred.
- **Triggering a re-seed from the admin UI** — re-seed is deploy-time; not in scope.
- **The ingestion-side rewire** to a live Dwellsy-DB connection (future Dwellsy-team work) — the export bridge is intentionally thin because of it.
- Actually curating the "possible" tier (human judgment, later).
