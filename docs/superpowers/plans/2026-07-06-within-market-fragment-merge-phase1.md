# Within-Market Fragment Merge — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-merge exact-tier within-market operator fragments (same market, identical normalized name, no parent id) by keying no-parent operators on normalized name instead of `child_company_id`, so their listings pool into one operator and all metrics recompute over the union.

**Architecture:** A pure `operator_grouping.py` module computes the within-market grouping key (unit-tested in isolation). `pipeline.py` uses it in the row-streaming loop, and decouples the emitted Dwellsy `companyId` from the grouping key by tracking a representative child-id (the operator's most-recent live id). A committed `do_not_merge.json` (starts empty) is the escape hatch. Then an all-markets re-run + audit regenerates the seed.

**Tech Stack:** Python 3 (stdlib, `unittest`); the offline seed pipeline. No TypeScript changes (seed shape unchanged — fewer/renamed PMs only).

**Spec:** `docs/superpowers/specs/2026-07-06-within-market-fragment-merge-design.md`

## Global Constraints

- **Do NOT run `prisma db seed`** locally (writes shared prod DB); re-seed on deploy. Pipeline runs use scratch `--out-dir` unless doing the final apply.
- **Do NOT read `.env*` files.**
- Run the Python pipeline with `scripts/data-pipeline/` as the working directory.
- Reuse `name_key` from `tenancy_survival.py` (already imported in `pipeline.py`) — recency and identity must group operators identically.
- Merged grouping key is namespaced `f"name:{nkey}"` so it can never collide with a numeric id key.
- Only the **exact** tier (identical normalized name) is auto-merged. Near-matches are out of scope (Phase 2).
- `do_not_merge.json` **starts empty** (`[]`).
- This ships **before** the tenancy-metric redesign.
- Grouping change applies **only to no-parent operators**; parent-linked and old-schema paths are unchanged.

---

### Task 1: Pure `operator_grouping` module + tests + empty denylist

**Files:**
- Create: `scripts/data-pipeline/operator_grouping.py`
- Create: `scripts/data-pipeline/test_operator_grouping.py`
- Create: `scripts/data-pipeline/do_not_merge.json`

**Interfaces:**
- Produces (used by Task 2):
  - `within_market_key(parent_id, child_id, name, market_id, do_not_merge) -> str`
  - `load_do_not_merge(path) -> set[tuple[str, str]]`

- [ ] **Step 1: Write the failing tests**

Create `scripts/data-pipeline/test_operator_grouping.py`:

```python
import unittest, json, tempfile, os
from operator_grouping import within_market_key, load_do_not_merge

class WithinMarketKey(unittest.TestCase):
    def test_parent_id_wins_unchanged(self):
        # parent present -> group by parent id (parent rules), regardless of name/child
        self.assertEqual(within_market_key("999", "111", "Omega Realty", "birmingham-al", set()), "999")

    def test_no_parent_groups_same_name_fragments(self):
        # two child-ids, same name, no parent -> SAME name-based key
        k1 = within_market_key("", "545103", "Omega Realty Group", "birmingham-al", set())
        k2 = within_market_key("", "915057", "Omega Realty Group", "birmingham-al", set())
        self.assertEqual(k1, k2)
        self.assertEqual(k1, "name:omegarealtygroup")

    def test_name_key_normalizes_casing_and_punctuation(self):
        self.assertEqual(
            within_market_key("", "1", "R.P. Management, Inc.", "minneapolis", set()),
            within_market_key("", "2", "RP Management Inc", "minneapolis", set()),
        )

    def test_denylisted_name_stays_fragmented_by_child_id(self):
        dnm = {("birmingham-al", "omegarealtygroup")}
        k1 = within_market_key("", "545103", "Omega Realty Group", "birmingham-al", dnm)
        k2 = within_market_key("", "915057", "Omega Realty Group", "birmingham-al", dnm)
        self.assertNotEqual(k1, k2)          # kept separate
        self.assertEqual(k1, "545103")

    def test_denylist_is_market_scoped(self):
        dnm = {("birmingham-al", "omegarealtygroup")}
        # same name, DIFFERENT market -> not denylisted -> still merges
        self.assertEqual(
            within_market_key("", "111", "Omega Realty Group", "houston-tx", dnm),
            "name:omegarealtygroup",
        )

    def test_no_ids_old_schema_falls_back_to_name(self):
        self.assertEqual(within_market_key("", "", "Some Realty", "x", set()), "name:somerealty")

class LoadDoNotMerge(unittest.TestCase):
    def test_empty_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump([], f); p = f.name
        self.assertEqual(load_do_not_merge(p), set()); os.unlink(p)

    def test_loads_pairs(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump([{"marketId": "birmingham-al", "normalizedName": "omegarealtygroup", "note": "x"}], f); p = f.name
        self.assertEqual(load_do_not_merge(p), {("birmingham-al", "omegarealtygroup")}); os.unlink(p)

    def test_missing_file_is_empty(self):
        self.assertEqual(load_do_not_merge("/no/such/file.json"), set())

if __name__ == "__main__":
    unittest.main()
```

Run: `cd scripts/data-pipeline && python3 test_operator_grouping.py` → expect FAIL (no module).

- [ ] **Step 2: Write the module**

Create `scripts/data-pipeline/operator_grouping.py`:

```python
#!/usr/bin/env python3
"""Pure within-market operator grouping key (Phase 1 fragment merge).

The source issues the same operator new child_company_ids over time (batch-era
churn), which the pipeline previously keyed as separate fragments. We group
no-parent operators by normalized name so those fragments pool into one
operator. Parent-linked operators keep parent-id grouping ("parent rules").
See docs/superpowers/specs/2026-07-06-within-market-fragment-merge-design.md.
"""

import json
import os
from tenancy_survival import name_key


def within_market_key(parent_id, child_id, name, market_id, do_not_merge):
    """Return the within-market grouping key for one operator row.

    parent_id present            -> the parent id (parent rules; unchanged).
    no parent, name available    -> f"name:{name_key(name)}" (merge same-name
                                    fragments) UNLESS (market_id, name_key) is
                                    on the do-not-merge list, in which case keep
                                    the child id (stay fragmented).
    no parent, no usable name    -> the child id (or "" if none)."""
    pid = (parent_id or "").strip()
    if pid:
        return pid
    cid = (child_id or "").strip()
    nkey = name_key(name)
    if not nkey:
        return cid
    if (market_id, nkey) in do_not_merge:
        return cid or f"name:{nkey}"
    return f"name:{nkey}"


def load_do_not_merge(path):
    """Load do_not_merge.json -> set of (marketId, normalizedName). Missing file
    or empty list -> empty set (the launch state — nothing denylisted)."""
    if not os.path.isfile(path):
        return set()
    with open(path) as f:
        rows = json.load(f)
    return {(r["marketId"], r["normalizedName"]) for r in rows}
```

Run the tests again → expect OK.

- [ ] **Step 3: Create the empty denylist**

Create `scripts/data-pipeline/do_not_merge.json` with exactly:

```json
[]
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data-pipeline/operator_grouping.py scripts/data-pipeline/test_operator_grouping.py scripts/data-pipeline/do_not_merge.json
git commit -m "feat(pipeline): pure within-market grouping key + empty do-not-merge list"
```

---

### Task 2: Wire grouping + representative companyId into pipeline.py

**Files:**
- Modify: `scripts/data-pipeline/pipeline.py` (imports; `DO_NOT_MERGE` load; `init_rich`; grouping-key block ~484–505; `last_event_dt` tracking ~560; companyId emission line ~1841; fragment-sidecar companyId ~1934)

**Interfaces:**
- Consumes: `within_market_key`, `load_do_not_merge` (Task 1).
- Produces: pooled same-name no-parent operators (one `norm` per market-name); `pm_rich[norm]["rep_company_id"]` = the operator's most-recent live child/parent id, emitted as `companyId`.

- [ ] **Step 1: Import + load the denylist**

Add to the `tenancy_survival` import line region:

```python
from operator_grouping import within_market_key, load_do_not_merge
```

Load the denylist once near the market-config setup (after `_SCRIPT_DIR` / markets load, before the streaming loop):

```python
DO_NOT_MERGE = load_do_not_merge(os.path.join(_SCRIPT_DIR, "do_not_merge.json"))
```

- [ ] **Step 2: Track a representative company id per operator — init**

In `init_rich(norm)`, add next to `"last_event_dt": None,`:

```python
        "rep_company_id": None,
```

- [ ] **Step 3: Replace the grouping-key block**

Replace the grouping-key block (pipeline.py ~484–505) — keep computing `eff_id` for `eff_id_norms` / parent tracking, but derive the grouping `key` from `within_market_key`:

```python
        eff_id = effective_company_id(row)          # parent-else-child; for eff_id_norms + companyId fallback
        _parent_id_raw = (row.get("parent_company_id") or "").strip()
        _child_id_raw = (row.get("child_company_id") or "").strip()
        key = within_market_key(_parent_id_raw, _child_id_raw, company, _mkt["id"], DO_NOT_MERGE)
        # Display name: PARENT name when parented, else the friendly company_name (col 8).
        disp = (row.get("parent_company_name") or "").strip() if _parent_id_raw else company.strip()
        if not disp:
            disp = company.strip()
        norm = key
```

(`_mkt` is the loaded market config; `_mkt["id"]` is the market id. `company` is the col-8 friendly name already in scope. `effective_company_id` and the `if eff_id: eff_id_norms.add(norm)` / `parent_id_votes` lines that follow stay unchanged — `eff_id` is still non-empty for no-parent operators since they have a child id.)

- [ ] **Step 4: Track `rep_company_id` at the most-recent event**

Extend the `last_event_dt` tracking block (added for the recency gate, ~560) so the representative id follows the latest event:

```python
        for _ev in (ct, dt_):
            if _ev and (d["last_event_dt"] is None or _ev > d["last_event_dt"]):
                d["last_event_dt"] = _ev
                d["rep_company_id"] = eff_id or _child_id_raw or None
```

(For parent-linked operators `eff_id` is the constant parent id → `rep_company_id` = parent id, matching today's `companyId`. For merged no-parent operators it's the child id of the most-recent listing — the current live Dwellsy company page.)

- [ ] **Step 5: Emit `companyId` from `rep_company_id`**

Change the ranked-PM companyId (pipeline.py ~1841) from:

```python
        "companyId": norm if norm in eff_id_norms else None,
```
to:
```python
        "companyId": pm_rich[norm].get("rep_company_id"),
```

And the fragment-sidecar companyId (~1934) from `"companyId": _n,` to:

```python
        "companyId": pm_rich[_n].get("rep_company_id"),
```

- [ ] **Step 6: Integration check — a fragmented operator pools into one**

```bash
cd scripts/data-pipeline && mkdir -p /tmp/iq_fm && \
python3 pipeline.py --market birmingham-al --config markets.json --out-dir /tmp/iq_fm && \
python3 -c "
import json, glob
b=json.load(open(sorted(glob.glob('/tmp/iq_fm/*irmingham*'))[0]))
omega=[p for p in b['pms'] if 'omega realty' in p['name'].lower()]
print('Omega ranked entries:', len(omega))
for p in omega: print('   ', p['name'], '| companyId', p.get('companyId'), '| t12', p.get('coverage',{}).get('t12Listings'))
"
```

Expected: **exactly 1** Omega Realty entry (was several), its `companyId` is a real child-id (e.g. `915057`, the most-recent) — NOT `name:omegarealtygroup` — and its T12 is the pooled sum.

- [ ] **Step 7: Run the pure tests to confirm nothing regressed**

Run: `cd scripts/data-pipeline && python3 test_operator_grouping.py && python3 test_tenancy_survival.py`
Expected: both OK.

- [ ] **Step 8: Commit**

```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(pipeline): merge no-parent same-name fragments; decouple companyId"
```

---

### Task 3: Fragment-merge audit script (collapsed + newly-eligible review)

**Files:**
- Create: `scripts/data-pipeline/audit_fragment_merge.py`

**Interfaces:** none (read-only diagnostic; run in Task 4).

- [ ] **Step 1: Write the audit script**

Create `scripts/data-pipeline/audit_fragment_merge.py`:

```python
#!/usr/bin/env python3
"""Read-only before/after audit for the within-market fragment merge.
Usage: python3 audit_fragment_merge.py OLD_SEED NEW_SEED
Reports duplicate operators collapsed and the NEWLY-ELIGIBLE operators (no
ranked member under the old grouping) for eyeball review before committing."""
import json, sys, collections

def nk(s): return "".join(c.lower() for c in (s or "") if c.isalnum())

old = json.load(open(sys.argv[1])); new = json.load(open(sys.argv[2]))
def by_mkt_name(seed):
    d = collections.defaultdict(list)
    for p in seed["pms"]:
        d[(p.get("marketId"), nk(p["name"]))].append(p)
    return d
o, n = by_mkt_name(old), by_mkt_name(new)

old_pms = len(old["pms"]); new_pms = len(new["pms"])
collapsed = sum(len(v) - 1 for v in o.values() if len(v) > 1)
newly = [(mk, v[0]["name"], v[0].get("coverage", {}).get("t12Listings"))
         for (mk, name), v in n.items() if (mk, name) not in o]
print(f"PMs: {old_pms} -> {new_pms}  (delta {new_pms - old_pms})")
print(f"duplicate operators collapsed (old multi-member name-groups): {collapsed}")
print(f"NEWLY-ELIGIBLE operators (review these — a bad merge here fabricates a ranked op): {len(newly)}")
for mk, name, t12 in sorted(newly, key=lambda x: -(x[2] or 0)):
    print(f"   {mk[:24]:24s} {name[:34]:34s} T12={t12}")
```

- [ ] **Step 2: Smoke-test it runs**

Run: `cd scripts/data-pipeline && python3 audit_fragment_merge.py ../../src/data/scorecard_data.json ../../src/data/scorecard_data.json`
Expected: runs clean; delta 0, collapsed = current in-seed duplicate count, newly-eligible 0 (same file vs itself).

- [ ] **Step 3: Commit**

```bash
git add scripts/data-pipeline/audit_fragment_merge.py
git commit -m "chore(pipeline): fragment-merge before/after audit script"
```

---

### Task 4: Full re-run, newly-eligible review, verify, PR

**Files:** uses `pipeline.py`, `apply_canonicals.py`, `normalize_pm_names.py`, `merge.py`, `build-operator-universe.ts`, `audit_fragment_merge.py`.

**Interfaces:** none (produces the regenerated seed + PR).

- [ ] **Step 1: Snapshot the current seed for the audit baseline**

```bash
cd "$(git rev-parse --show-toplevel)" && git show HEAD:src/data/scorecard_data.json > /tmp/seed_before_fm.json
```

- [ ] **Step 2: Re-run all 34 markets → canonicals → normalize → merge (dry-run first)**

For each market id in `markets.json`: `python3 pipeline.py --market <id> --config markets.json` (writes per-market JSONs to the data dir). Then `apply_canonicals.py --decisions <p1_base…p8> --apply` (each file in order), `normalize_pm_names.py --apply`, then **`merge.py` (dry-run)** and inspect the PM diff — expect `-(duplicates collapsed) + (newly-eligible passing all gates)`, markets 34→34, no unexpected canonical churn.

- [ ] **Step 3: Newly-eligible review (the safety valve)**

```bash
cd scripts/data-pipeline && python3 -c "import json,glob;print(sorted(glob.glob('/tmp/scorecard_data.merged.*.json'))[-1])"   # locate dry-run merged file
python3 audit_fragment_merge.py /tmp/seed_before_fm.json <dry-run merged file>
```
Scan the newly-eligible list (~177). For any that look like **two distinct businesses** sharing a name (not one operator's id churn — check via geography/date if unsure), add `{marketId, normalizedName, note}` to `do_not_merge.json`, re-run those markets, and re-audit. Iterate until the list is clean.

- [ ] **Step 4: Apply the merge + rebuild derived files**

`python3 merge.py --apply` → `npx tsx scripts/build-operator-universe.ts`.

- [ ] **Step 5: Before/after audit + spec-check the numbers**

Re-run `audit_fragment_merge.py /tmp/seed_before_fm.json ../../src/data/scorecard_data.json`. Confirm: ~381 duplicates collapsed, newly-eligible reconciles with the ~177 estimate (minus any denylisted / address-gate failures). Spot-check a formerly-fragmented operator (Omega) — its tenancy/DOM/rent now computed over the pooled listings.

- [ ] **Step 6: Typecheck + JS tests**

Run: `npx tsc --noEmit && npm run test:watch-list`
Expected: clean; seed shape unchanged so no TS breakage.

- [ ] **Step 7: Screenshot**

Via `/dev/scorecards/[slug]?view=new`: a consolidated formerly-fragmented operator (Omega) and a newly-eligible operator (Shannon, Houston).

- [ ] **Step 8: Commit + PR**

```bash
git add scripts/data-pipeline/do_not_merge.json src/data/scorecard_data.json src/data/markets-summary.json src/data/merge_fragments.json src/data/search_index.json
git commit -m "data: re-seed 34 markets — within-market exact-tier fragment merge"
git push -u origin feat/fragment-merge-phase1
gh pr create --title "Within-market fragment merge (Phase 1: exact-tier auto-merge)" --body-file <summary with audit numbers>
```

(Base: `main` once PR #165 has merged; otherwise stack on `feat/departed-operator-gate`. Do NOT merge — Jonas merges explicitly; re-seed runs on deploy.)

---

## Self-Review

**Spec coverage:** §2/§3 grouping mechanic → Tasks 1–2; §3 companyId decoupling → Task 2 Steps 2/4/5; §4 do-not-merge list → Task 1 Step 3 + Task 2 Step 1; §6 migration/report/newly-eligible review → Tasks 3–4; §5 interactions (name_key reuse, recency compatibility) → Global Constraints + Task 1. All covered.

**Placeholder scan:** every code step has complete code or an exact command with expected output. Task 4 Step 2 references the established per-market batch loop (same one used for prior refreshes) rather than re-listing 34 commands; the canonical-decision files are the committed `p1_base…p8`.

**Type/name consistency:** `within_market_key` / `load_do_not_merge` signatures match between Task 1 (definition + tests) and Task 2 (call site). `rep_company_id` is initialized (Task 2 Step 2), written (Step 4), and read (Step 5) under the same key. The namespaced `name:<key>` form is used consistently. `name_key` is the shared helper from `tenancy_survival.py`.

**Cross-task ordering:** Task 2 depends on Task 1's module; Task 4 depends on Tasks 1–3. Phase 1 depends on PR #165 (for `name_key`), reflected in the branch base note.
