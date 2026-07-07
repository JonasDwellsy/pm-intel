# Within-Market Fragment Merge — Phase 1 (exact-tier auto-merge)

**Status:** Design approved (2026-07-06), pending spec review.
**Owner:** Jonas Bordo / Operator IQ
**Scope:** Phase 1 only — auto-merge the *exact* tier (same market, identical normalized name, no shared parent id) in the pipeline. Phase 2 (human-curated *possible* near-match tier, DB→pipeline apply) is a separate later spec.
**Sequencing:** ships **before** the survival tenancy-metric redesign, so operators are graded on full history the first time.

---

## 1. Problem

Within a market, the same operator is recorded under **multiple `child_company_id`s over time** — the source issues new child ids in batch eras (the `545k → 907k → 908k → 915k → 916k` ranges recur across operators, with sequential/handoff date ranges). The pipeline's within-market grouping keys a no-parent operator by its `child_company_id` (`effective_company_id` returns `parent_company_id` when present, else `child_company_id`), so each batch-era id becomes a **separate ranked operator**.

Two consequences, quantified against the current seed (post-recency-gate, 3,880 PMs):

1. **Duplicate ranked operators.** 285 within-market names appear as 2+ ranked PMs — **666 PMs, 381 collapsible duplicates** (~10% of the ranked set). E.g. Omega Realty (Birmingham) as 4 child-id fragments; Rivertown Realty (Memphis) ×5.
2. **Real operators hidden below the eligibility cutoff.** Because fragmentation splits an operator's listings across child-ids, operators whose combined T12 clears `ELIG_T12_MIN=30` but whose individual fragments don't are **invisible today**. Estimated **~177 newly-eligible operators**, several large — e.g. Shannon Property Management (Houston, combined T12 **388**), 1st Choice (Dallas, 255), Red Door (Indianapolis, 241), Trust Home Properties (Orlando, 228).

Neither is caught by existing machinery: cross-market identity (Phase B) links by `parent_company_id`, which these fragments lack; the operator-merge admin tool (`merge-candidates.ts`) *surfaces* these clusters but its apply-to-seed path was never built.

## 2. Approach: exact-tier auto-merge in the pipeline

Change the within-market grouping so a **no-parent operator keys by its normalized name** instead of `child_company_id`. Same-name fragments then pool into one operator under a single grouping handle, and **every downstream metric recomputes over the union automatically** (tenancy, DOM, rent, marketing, community-visibility, eligibility, the recency gate) because they all read the pooled `pm_rich[norm]` listings. Operators *with* a parent id keep parent-id grouping, unchanged; old-schema CSVs already key by name.

- **Exact tier only.** This merges only *identical* normalized names — the tier the merge tool classifies as `exact`. Near-matches (`possible` tier: appended agent names, distinctive-subset token matches) are **not** touched here; they go through human curation in Phase 2.
- **Escape hatch:** a committed **do-not-merge list** keyed by `(marketId, normalizedName)`. Listed names fall back to child-id keying (stay fragmented). **Starts empty** — the 8 highest-risk generic-name groups (TG, 3G, ES, G1, RP, SIG, 31 Realty, LA Property Management Group) were reviewed and all confirmed single operators (same geography, sequential child-id handoff), so none are denylisted at launch.
- **Why auto (not curated) for this tier:** exact same-name + same-market + no-parent + the batch-id-churn signature is a source data-quirk cleanup, not a judgment call. Reviewing all 285 by hand is impractical, and the review of the riskiest 8 came back 8/8 clean. The `possible` tier — where judgment is genuinely needed — stays human-curated (Phase 2).

## 3. Mechanic (pipeline.py)

The grouping-key block (pipeline.py:484–505) currently does:

```python
eff_id = effective_company_id(row)          # parent_company_id if present, else child_company_id
if eff_id:
    key = eff_id
    _pname = (row.get("parent_company_name") or "").strip()
    disp = _pname if _pname else company.strip()
else:
    key = norm                               # old-schema fallback
    disp = company.strip()
norm = key
```

**Change:** when there is **no parent id** (the `eff_id` came from `child_company_id`), key by the normalized name instead — unless the `(marketId, name_key)` pair is on the do-not-merge list. Concretely, distinguish parent-id from child-id in the caller (e.g. read `parent_company_id` directly here, or have `effective_company_id` signal which it returned), then:

```python
parent_id = (row.get("parent_company_id") or "").strip()
if parent_id:
    key = parent_id                          # parent rules — unchanged
    disp = (row.get("parent_company_name") or "").strip() or company.strip()
else:
    nkey = name_key(company)                 # tenancy_survival.name_key (already imported)
    if (MARKET_ID, nkey) in DO_NOT_MERGE:
        key = (row.get("child_company_id") or "").strip() or nkey   # keep fragmented
    else:
        key = f"name:{nkey}"                 # MERGE same-name no-parent fragments
    disp = company.strip()
norm = key
```

- **`name_key`** is the existing helper in `tenancy_survival.py` (added for the recency gate) — reuse it for consistency, so recency and identity group operators identically.
- **`key = f"name:{nkey}"`** namespaces the name-based key so it can't collide with a numeric id key.
- **Survivor display name:** the existing `pm_display_name` logic (pipeline.py:516–518, "prefer more word boundaries, then longer") already picks the most readable variant across the pooled rows — no change needed.
- **Survivor `companyId`** (the Dwellsy company-page link): the operator now spans multiple child-ids, so pick a single representative — the **child_company_id of the operator's most-recent listing event** (its current live id). Track per-`norm` alongside `last_event_dt`.
- **`canonicalOperatorId`** and everything downstream are unchanged — they key off `norm`, which now unites the fragments.

## 4. Do-not-merge list

- **File:** `scripts/data-pipeline/do_not_merge.json` (committed). Format: `[{"marketId": "...", "normalizedName": "...", "note": "..."}]`. Loaded by the pipeline into the `DO_NOT_MERGE` set of `(marketId, normalizedName)`.
- **Launch contents:** empty (`[]`) — the 8 reviewed generic-name groups are all legitimate single operators.
- **Maintenance:** a curator adds an entry when the validation report (or the merge tool) surfaces a genuinely-distinct same-name collision. This is the human escape hatch that keeps the auto-merge honest.

## 5. Interactions

- **Recency gate (shipped, PR #165):** its name-level aggregation was a workaround for exactly this fragmentation. Once fragments merge, each operator is one `norm` with one `last_event_dt`, so the recency check is naturally correct — no rework, fully compatible. (`name_key` is shared between them.)
- **Tenancy metric (next PR):** runs *after* this, so it computes survival over each operator's full listing history rather than a single child-id slice.
- **merge_fragments.json / the admin merge tool:** exact-tier clusters no longer appear (they're already merged in the seed). The tool then surfaces only the `possible` near-match tier plus any denylisted names — which is exactly Phase 2's input.
- **Cross-market identity (Phase B / merge.py `link_by_parent_id`):** unchanged; still links by `parent_company_id` across markets. This change is within-market only, and only for no-parent operators.

## 6. Migration & verification

1. **Re-run pipeline** across all 34 markets → `apply_canonicals` (p1_base…p8) → `normalize_pm_names` → `merge.py --apply` → `build-operator-universe.ts`. (Do **not** `prisma db seed` locally; re-seed on deploy.)
2. **Emit a merge validation report** (pipeline-side or a scratch audit): per market — number of exact groups collapsed, duplicate PMs removed, and the list of **newly-eligible operators** (Case B). Because a wrong merge that *creates* a ranked operator is higher-consequence than one that muddies an existing one, the ~177 newly-eligible are **listed for eyeball review**; anything that looks like two distinct businesses goes on the do-not-merge list and the market is re-run.
3. **Before/after audit** (read-only, committed seed vs new): operator-count delta reconciles as `−(duplicates collapsed) + (newly eligible passing all gates)`; spot-check merged operators' recomputed metrics against the union of their former fragments (e.g. Omega tenancy/DOM over full history); confirm no genuinely-distinct operator was merged (scan newly-eligible + any all-generic names).
4. **tsc + full JS suite green**; the seed shape is unchanged (fewer/renamed PMs), so no TS code changes are expected — this is a pipeline + data PR.
5. **Screenshot** a formerly-fragmented operator (e.g. Omega) showing consolidated metrics, and a newly-eligible operator (e.g. Shannon Houston) now ranked.
6. Commit seed + derived files + `do_not_merge.json`; open PR. Re-seed runs on deploy; eyeball the Preview.

## 7. Out of scope

- **Phase 2:** the `possible` near-match tier (human-curated in the admin tool) and its DB→committed-file→pipeline apply path. Separate spec.
- Cross-market identity (already handled by parent-id linking).
- Retiring `child_company_id` grouping for parent-linked operators (unchanged).

## 8. Assumptions & limits

- **Within a market, identical normalized name = same operator.** Validated on the 8 riskiest generic-name groups (8/8 single operators). Residual risk (two distinct same-name businesses in one metro) is covered by the do-not-merge list + the newly-eligible review.
- **`companyId` becomes a single representative** (most-recent live child-id); the other child-ids are no longer surfaced as separate Dwellsy links. Acceptable — they were never meaningful standalone operators.
- **Slugs change:** a merged operator gets one survivor slug; former per-fragment slugs disappear. Fragments weren't shared/canonical entities, so no stable inbound links are expected to break; noted for the Preview eyeball.
