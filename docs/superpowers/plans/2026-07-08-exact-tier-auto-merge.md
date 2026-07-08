# Exact-Tier Auto-Merge (Fragment Merge Phase 1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-merge the within-market exact-tier operator dupes (identical after stripping legal suffixes + punctuation, gated by a distinctiveness guard) at pipeline time via a computed merge_map pre-pass, and fix the curated-merge exporter to resolve sub-eligible fragment members.

**Architecture:** New pure logic in `operator_grouping.py` (shared normalization + auto-merge computation + report/invariant helpers), consumed by a cheap per-market pre-pass in `pipeline.py` that builds an auto-merge map, overlays the curated map (curated wins), and feeds both through the existing `within_market_key`/`merged_override` plumbing. One independent fix to `export_merge_decisions.ts`. No schema change, no deploy-time (`db seed`) change — everything lands on the next full pipeline refresh + re-seed.

**Tech Stack:** Python 3 (stdlib `unittest`, `re`, `csv`, `json`), TypeScript (`tsx`, `node:test`).

## Global Constraints

- **Never run `prisma db seed`** (writes the shared prod Neon DB). Pipeline runs use a scratch `--out-dir`.
- **Do not read `.env*` files.** No task in this plan needs the DB.
- **`merge_decisions.json` and the computed auto-merge map are PIPELINE inputs only** — not read by deploy-time `db seed`. This work changes live scorecards only on the next full all-markets refresh + re-seed, not the next deploy.
- **0-false-merge bar** (the Phase-1 #166 standard). Auto-merge is guarded by: the mergeability filter, the distinctiveness guard, the `do_not_merge` veto, and the invariant assertions.
- **Verbatim values** (copied from `src/lib/operators/merge-candidates.ts`):
  - `LEGAL_SUFFIXES = {"inc", "llc", "llp", "lp", "ltd", "co", "corp", "corporation", "company"}`
  - `GENERIC_TOKENS = {"property", "properties", "management", "mgmt", "realty", "real", "estate", "group", "homes", "home", "rentals", "rental", "services", "service", "the", "of", "and"}`
- **`strong_name_key` must be ASCII** (`[^a-z0-9]+`), matching TS `normalizeOperatorName`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do not push/merge without Jonas's explicit "merge N".

## File Structure

- `scripts/data-pipeline/operator_grouping.py` — MODIFY: add `LEGAL_SUFFIXES`, `GENERIC_TOKENS`, `strong_name_key`, `is_distinctive`, `_legal_suffix_count`, `compute_auto_merges`, `auto_merge_map`, `assert_auto_merge_invariants`, `format_auto_merge_report`. (All pure; no I/O.)
- `scripts/data-pipeline/test_operator_grouping.py` — MODIFY: add unit tests for all the above.
- `scripts/data-pipeline/pipeline.py` — MODIFY: import the new helpers; rename `MERGE_MAP` load → `CURATED_MAP`; insert the auto-merge pre-pass + report before the grouping loop; route override slugs through slug disambiguation; refactor the sidecar block to the shared normalization.
- `scripts/data-pipeline/export_merge_decisions.ts` — MODIFY: resolve `frag-<key>` member slugs against `merge_fragments.json`.
- `scripts/data-pipeline/export_merge_decisions.test.ts` — MODIFY: add fragment-resolution tests.

---

### Task 1: Shared normalization helpers

**Files:**
- Modify: `scripts/data-pipeline/operator_grouping.py` (add after the `PLACEHOLDER_NAME_KEYS` block, before `within_market_key`)
- Test: `scripts/data-pipeline/test_operator_grouping.py`

**Interfaces:**
- Produces: `strong_name_key(name: str) -> str`, `is_distinctive(strong_norm: str) -> bool`, `_legal_suffix_count(name: str) -> int`, module constants `LEGAL_SUFFIXES`, `GENERIC_TOKENS`.
- Consumes: stdlib `re` (add `import re` at top of module if absent).

- [ ] **Step 1: Write the failing tests**

Add to `test_operator_grouping.py`:

```python
from operator_grouping import (
    strong_name_key, is_distinctive, _legal_suffix_count,
    LEGAL_SUFFIXES, GENERIC_TOKENS,
)

class StrongNameKey(unittest.TestCase):
    def test_strips_legal_suffix_and_punctuation(self):
        self.assertEqual(strong_name_key("Spectrum Realty Services, LLC"), "spectrum realty services")
        self.assertEqual(strong_name_key("Spectrum Realty Services"), "spectrum realty services")
    def test_inc_corp_company(self):
        self.assertEqual(strong_name_key("Federated Property Management Group, Inc."),
                         "federated property management group")
    def test_ascii_only_drops_accents(self):
        # accented chars are non-[a-z0-9] -> become separators (ASCII parity with TS)
        self.assertEqual(strong_name_key("Peña Realty"), "pe a realty")
    def test_all_suffix_falls_back_to_raw_norm(self):
        # nothing distinctive left -> join of [] is "" -> fall back to the space-normed s
        self.assertEqual(strong_name_key("LLC"), "llc")
    def test_empty(self):
        self.assertEqual(strong_name_key(""), "")

class IsDistinctive(unittest.TestCase):
    def test_generic_only_false(self):
        self.assertFalse(is_distinctive("property management"))
        self.assertFalse(is_distinctive("real estate group"))
    def test_has_non_generic_true(self):
        self.assertTrue(is_distinctive("31 realty property management"))
        self.assertTrue(is_distinctive("spectrum realty services"))
    def test_single_token_false(self):
        self.assertFalse(is_distinctive("redfin"))
    def test_empty_false(self):
        self.assertFalse(is_distinctive(""))

class LegalSuffixCount(unittest.TestCase):
    def test_counts_suffix_tokens(self):
        self.assertEqual(_legal_suffix_count("31 Realty Property Management LLC"), 1)
        self.assertEqual(_legal_suffix_count("Acme Co., Inc."), 2)
        self.assertEqual(_legal_suffix_count("31 Realty Property Management"), 0)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd scripts/data-pipeline && python3 -m unittest test_operator_grouping -v`
Expected: FAIL with ImportError (symbols not defined).

- [ ] **Step 3: Implement the helpers**

Add `import re` to the top of `operator_grouping.py` if not present. Add after the `PLACEHOLDER_NAME_KEYS` frozenset:

```python
# Verbatim from src/lib/operators/merge-candidates.ts so the pipeline auto-merge,
# the merge tool, and the sub-eligible sidecar all normalize names identically.
LEGAL_SUFFIXES = frozenset({
    "inc", "llc", "llp", "lp", "ltd", "co", "corp", "corporation", "company",
})
GENERIC_TOKENS = frozenset({
    "property", "properties", "management", "mgmt", "realty", "real", "estate",
    "group", "homes", "home", "rentals", "rental", "services", "service",
    "the", "of", "and",
})


def strong_name_key(name):
    """Lowercase, non-alnum -> space, drop legal-suffix tokens, join with space.
    ASCII-only ([^a-z0-9]+) — matches TS normalizeOperatorName, and closes the
    latent accented-char name_key parity gap on the auto-merge path. Falls back
    to the space-normed string if every token is a legal suffix."""
    s = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    toks = [t for t in s.split(" ") if t and t not in LEGAL_SUFFIXES]
    return " ".join(toks) or s


def is_distinctive(strong_norm):
    """>=2 tokens AND >=1 token outside GENERIC_TOKENS (the merge tool's
    _distinctive_set). Purely-generic or single-token names never auto-merge."""
    toks = [t for t in strong_norm.split(" ") if t]
    return len(toks) >= 2 and any(t not in GENERIC_TOKENS for t in toks)


def _legal_suffix_count(name):
    """Number of legal-suffix tokens in a raw name (used to pick the cleanest
    display variant — 'X' beats 'X LLC')."""
    toks = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).split()
    return sum(1 for t in toks if t in LEGAL_SUFFIXES)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd scripts/data-pipeline && python3 -m unittest test_operator_grouping -v`
Expected: PASS (all StrongNameKey / IsDistinctive / LegalSuffixCount tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/operator_grouping.py scripts/data-pipeline/test_operator_grouping.py
git commit -m "feat(pipeline): shared strong-norm helpers for exact-tier auto-merge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Auto-merge computation + map/report/invariant helpers

**Files:**
- Modify: `scripts/data-pipeline/operator_grouping.py` (add after Task 1's helpers)
- Test: `scripts/data-pipeline/test_operator_grouping.py`

**Interfaces:**
- Consumes: `within_market_key`, `strong_name_key`, `is_distinctive`, `_legal_suffix_count` (Task 1).
- Produces:
  - `compute_auto_merges(rows, market_id, do_not_merge) -> list[cluster]` where `rows` is an iterable of `{"parent_id","child_id","name"}` and each `cluster` is `{"strong", "survivorKey", "canonicalName", "survivorSlug", "members": [{"key","name","had_parent"}]}`.
  - `auto_merge_map(clusters, market_id) -> {(market_id, memberKey): {"survivorKey","canonicalName","survivorSlug"}}` (same shape as `load_merge_decisions`, survivor maps to itself).
  - `assert_auto_merge_invariants(clusters, market_id, do_not_merge) -> None` (raises `AssertionError` on violation).
  - `format_auto_merge_report(clusters, market_id) -> str`.

- [ ] **Step 1: Write the failing tests**

Add to `test_operator_grouping.py`:

```python
from operator_grouping import (
    compute_auto_merges, auto_merge_map,
    assert_auto_merge_invariants, format_auto_merge_report,
)

def _row(name, parent_id="", child_id=""):
    return {"parent_id": parent_id, "child_id": child_id, "name": name}

class ComputeAutoMerges(unittest.TestCase):
    def test_name_vs_name_suffix_only(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        cl = compute_auto_merges(rows, "atlanta-ga", set())
        self.assertEqual(len(cl), 1)
        c = cl[0]
        self.assertEqual(c["strong"], "spectrum realty services")
        self.assertEqual(c["canonicalName"], "Spectrum Realty Services")   # fewer suffix tokens
        self.assertEqual(c["survivorKey"], "name:spectrumrealtyservices")   # no parent -> canonical name-key
        self.assertEqual(sorted(m["key"] for m in c["members"]),
                         ["name:spectrumrealtyservices", "name:spectrumrealtyservicesllc"])

    def test_name_vs_parent_31_realty_shape(self):
        rows = [_row("31 Realty Property Management", parent_id="31871", child_id="3206"),
                _row("31 Realty Property Management LLC", child_id="915314")]
        cl = compute_auto_merges(rows, "dallas-fort-worth-arlington-tx", set())
        self.assertEqual(len(cl), 1)
        c = cl[0]
        self.assertEqual(c["survivorKey"], "31871")                          # parent id wins
        self.assertEqual(c["canonicalName"], "31 Realty Property Management") # suffix-free
        self.assertEqual(sorted(m["key"] for m in c["members"]),
                         ["31871", "name:31realtypropertymanagementllc"])

    def test_parent_vs_parent_lowest_id(self):
        rows = [_row("Acme Property Management", parent_id="900", child_id="1"),
                _row("Acme Property Management", parent_id="100", child_id="2")]
        cl = compute_auto_merges(rows, "x", set())
        self.assertEqual(cl[0]["survivorKey"], "100")

    def test_placeholder_never_merges(self):
        rows = [_row("Company Name Not Provided", child_id="915314"),
                _row("Company Name Not Provided", child_id="545338")]
        self.assertEqual(compute_auto_merges(rows, "chicago", set()), [])

    def test_name_key_denylisted_never_merges(self):
        dnm = {("birmingham-al", "omegarealtygroup")}   # name_key form (within_market_key)
        rows = [_row("Omega Realty Group", child_id="1"),
                _row("Omega Realty Group, LLC", child_id="2")]
        # both no-parent rows -> denylisted one returns child-id (non-candidate);
        # the LLC one is name-keyed but now alone in its strong group -> no merge.
        self.assertEqual(compute_auto_merges(rows, "birmingham-al", dnm), [])

    def test_generic_only_not_merged(self):
        rows = [_row("Property Management", child_id="1"),
                _row("Property Management LLC", child_id="2")]
        self.assertEqual(compute_auto_merges(rows, "x", set()), [])

    def test_single_token_not_merged(self):
        rows = [_row("Redfin", child_id="1"), _row("Redfin LLC", child_id="2")]
        self.assertEqual(compute_auto_merges(rows, "x", set()), [])

    def test_strong_norm_veto(self):
        dnm = {("atlanta-ga", "spectrum realty services")}  # strong-norm form (auto-merge veto)
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        self.assertEqual(compute_auto_merges(rows, "atlanta-ga", dnm), [])

    def test_single_base_key_no_merge(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services", child_id="2")]  # same name_key -> one base_key
        self.assertEqual(compute_auto_merges(rows, "x", set()), [])

    def test_canonical_prefers_fewest_suffix_tokens(self):
        # a no-parent "X" and a parented "X LLC": survivor = parent id (durable),
        # but canonical display = the suffix-free no-parent name.
        rows = [_row("Zeta Realty Partners", child_id="1"),
                _row("Zeta Realty Partners LLC", parent_id="5", child_id="2")]
        c = compute_auto_merges(rows, "x", set())[0]
        self.assertEqual(c["canonicalName"], "Zeta Realty Partners")   # 0 suffix tokens
        self.assertEqual(c["survivorKey"], "5")                        # parent id, decoupled from display

class AutoMergeMap(unittest.TestCase):
    def test_map_shape_survivor_maps_to_itself(self):
        rows = [_row("31 Realty Property Management", parent_id="31871", child_id="3206"),
                _row("31 Realty Property Management LLC", child_id="915314")]
        cl = compute_auto_merges(rows, "dfw", set())
        m = auto_merge_map(cl, "dfw")
        self.assertEqual(m[("dfw", "31871")]["survivorKey"], "31871")
        self.assertEqual(m[("dfw", "name:31realtypropertymanagementllc")]["survivorKey"], "31871")
        self.assertEqual(m[("dfw", "31871")]["canonicalName"], "31 Realty Property Management")

class AutoMergeInvariants(unittest.TestCase):
    def test_clean_clusters_pass(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        cl = compute_auto_merges(rows, "atlanta-ga", set())
        assert_auto_merge_invariants(cl, "atlanta-ga", set())  # no raise

    def test_report_nonempty_and_has_veto_string(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        cl = compute_auto_merges(rows, "atlanta-ga", set())
        rpt = format_auto_merge_report(cl, "atlanta-ga")
        self.assertIn("spectrum realty services", rpt)
        self.assertIn("do_not_merge.json", rpt)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd scripts/data-pipeline && python3 -m unittest test_operator_grouping -v`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement the functions**

Add to `operator_grouping.py` after Task 1's helpers:

```python
def compute_auto_merges(rows, market_id, do_not_merge):
    """Exact-tier auto-merges for one market. rows: iterable of dicts with keys
    parent_id, child_id, name (the market's post-exclusion operator rows).
    Returns a deterministic list of cluster dicts:
      {strong, survivorKey, canonicalName, survivorSlug,
       members: [{key, name, had_parent}]}
    No metrics/listings needed. within_market_key (map-free) is the mergeability
    oracle: a no-parent row whose natural key is a bare child id was deliberately
    kept unpooled (placeholder or name_key-denylisted) and is never a candidate."""
    by_key = {}  # base_key -> {"had_parent", "name" (cleanest seen), "strong"}
    for r in rows:
        pid = (r.get("parent_id") or "").strip()
        cid = (r.get("child_id") or "").strip()
        nm = r.get("name") or ""
        base = within_market_key(pid, cid, nm, market_id, do_not_merge, None)
        had_parent = bool(pid)
        if not had_parent and not base.startswith("name:"):
            continue  # placeholder / denylisted -> not a merge candidate
        strong = strong_name_key(nm)
        cur = by_key.get(base)
        cand = (_legal_suffix_count(nm), nm.lower())
        if cur is None or cand < (_legal_suffix_count(cur["name"]), cur["name"].lower()):
            by_key[base] = {"had_parent": had_parent, "name": nm, "strong": strong}
    by_strong = {}
    for base, info in by_key.items():
        by_strong.setdefault(info["strong"], []).append((base, info))
    clusters = []
    for strong, members in by_strong.items():
        if len(members) < 2:
            continue
        if not is_distinctive(strong):
            continue
        if (market_id, strong) in do_not_merge:
            continue
        canon_base, canon_info = min(
            members, key=lambda bi: (_legal_suffix_count(bi[1]["name"]), bi[1]["name"].lower()))
        parent_keys = [b for b, i in members if i["had_parent"]]
        if parent_keys:
            survivor_key = sorted(
                parent_keys, key=lambda k: (0, int(k)) if k.isdigit() else (1, k))[0]
        else:
            survivor_key = canon_base
        canonical_name = canon_info["name"]
        survivor_slug = re.sub(r"[^a-z0-9]+", "-", canonical_name.lower()).strip("-") + f"-{market_id}"
        clusters.append({
            "strong": strong,
            "survivorKey": survivor_key,
            "canonicalName": canonical_name,
            "survivorSlug": survivor_slug,
            "members": [{"key": b, "name": i["name"], "had_parent": i["had_parent"]}
                        for b, i in sorted(members)],
        })
    clusters.sort(key=lambda c: c["canonicalName"].lower())
    return clusters


def auto_merge_map(clusters, market_id):
    """clusters (from compute_auto_merges) -> {(market_id, memberKey): {survivorKey,
    canonicalName, survivorSlug}}, survivor mapping to itself — the exact shape
    within_market_key / merged_override consume from load_merge_decisions."""
    out = {}
    for c in clusters:
        info = {"survivorKey": c["survivorKey"], "canonicalName": c["canonicalName"],
                "survivorSlug": c["survivorSlug"]}
        keys = {m["key"] for m in c["members"]} | {c["survivorKey"]}
        for k in keys:
            out[(market_id, k)] = info
    return out


def assert_auto_merge_invariants(clusters, market_id, do_not_merge):
    """Fail loudly if any auto-merge cluster is structurally unsafe. Runs on every
    pipeline invocation before the map is applied."""
    seen_member = {}
    seen_slug = {}
    for c in clusters:
        assert is_distinctive(c["strong"]), f"non-distinctive auto-merge: {c['strong']!r}"
        assert (market_id, c["strong"]) not in do_not_merge, f"vetoed auto-merge emitted: {c['strong']!r}"
        keys = [m["key"] for m in c["members"]]
        assert len(keys) >= 2, f"degenerate cluster: {c['strong']!r}"
        assert len(set(keys)) == len(keys), f"duplicate member key: {c['strong']!r}"
        assert c["survivorKey"] in keys, f"survivor not a member: {c['strong']!r}"
        for k in keys:
            assert k not in seen_member or seen_member[k] == c["strong"], \
                f"member {k!r} spans two strong-norms"
            seen_member[k] = c["strong"]
        assert c["survivorSlug"] not in seen_slug or seen_slug[c["survivorSlug"]] == c["survivorKey"], \
            f"survivor slug collision: {c['survivorSlug']!r}"
        seen_slug[c["survivorSlug"]] = c["survivorKey"]


def format_auto_merge_report(clusters, market_id):
    """Human sign-off report: one block per auto-merge, with the exact
    do_not_merge veto string to paste to reject it."""
    lines = [f"# auto-merge report — {market_id} — {len(clusters)} cluster(s)"]
    for c in clusters:
        members = ", ".join(f"{m['name']!r}[{m['key']}]" for m in c["members"])
        lines.append(f"{c['canonicalName']!r}  (survivor {c['survivorKey']})  <-  {members}")
        lines.append(f'    veto: add {{"marketId":"{market_id}","normalizedName":"{c["strong"]}"}} to do_not_merge.json')
    return "\n".join(lines) + "\n"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd scripts/data-pipeline && python3 -m unittest test_operator_grouping -v`
Expected: PASS (all ComputeAutoMerges / AutoMergeMap / AutoMergeInvariants tests + Task 1's + the pre-existing suite).

- [ ] **Step 5: Commit**

```bash
git add scripts/data-pipeline/operator_grouping.py scripts/data-pipeline/test_operator_grouping.py
git commit -m "feat(pipeline): compute_auto_merges + map/report/invariant helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pipeline integration (pre-pass, report, slug disambiguation, sidecar refactor)

**Files:**
- Modify: `scripts/data-pipeline/pipeline.py`

**Interfaces:**
- Consumes: `compute_auto_merges`, `auto_merge_map`, `assert_auto_merge_invariants`, `format_auto_merge_report` (Task 2); existing `normalize_name`, `effective_company_type`, `EXCLUDED_COMPANY_TYPES`, `_DENYLIST_NORMS`, `DO_NOT_MERGE`, `log`, `OUT_DIR`, `MARKET_ID`, `MSA_CODE`, `CSV_PATH`.
- Produces: module-level `AUTO_MAP`, `CURATED_MAP`, combined `MERGE_MAP`; a per-market `auto_merge_report_<MARKET_ID>.txt` in `OUT_DIR`.

> This task has no standalone unit test; it is verified by the e2e run in Steps 6–7 (real DFW data), since it wires pure functions (already unit-tested) into the pipeline. Each step below is a precise edit.

- [ ] **Step 1: Extend the operator_grouping import**

In `pipeline.py` line ~46, replace:
```python
from operator_grouping import within_market_key, load_do_not_merge, load_merge_decisions, merged_override
```
with (all symbols this plan uses from the module, in one import — Steps 3 and 5 both draw from this list):
```python
from operator_grouping import (
    within_market_key, load_do_not_merge, load_merge_decisions, merged_override,
    compute_auto_merges, auto_merge_map, assert_auto_merge_invariants,
    format_auto_merge_report, strong_name_key, is_distinctive, GENERIC_TOKENS,
)
```

- [ ] **Step 2: Rename the curated-map load**

In `pipeline.py` line ~126, replace:
```python
MERGE_MAP = load_merge_decisions(os.path.join(_SCRIPT_DIR, "merge_decisions.json"))
```
with:
```python
CURATED_MAP = load_merge_decisions(os.path.join(_SCRIPT_DIR, "merge_decisions.json"))
```

- [ ] **Step 3: Insert the auto-merge pre-pass**

Immediately BEFORE the grouping loop's `with open(CSV_PATH, newline="", encoding="utf-8") as f:` (line ~467), insert:

```python
# v0.25 Phase 1.5 — exact-tier auto-merge. A cheap pre-pass over the same
# post-exclusion rows the grouping loop sees (below) computes a merge_map for
# operators whose names are identical after stripping legal suffixes + punctuation
# (distinctive names only). Curated decisions overlay on top and win on any key
# conflict. The combined map flows through within_market_key + merged_override
# unchanged. The filter checks here MUST mirror the grouping loop's skips.
_auto_rows = []
with open(CSV_PATH, newline="", encoding="utf-8") as _amf:
    for _r in csv.DictReader(_amf):
        if _r.get("msa_code") != MSA_CODE:
            continue
        _company = _r.get("company_name", "")
        if not _company:
            continue
        _n = normalize_name(_company)
        if not _n or _n in _DENYLIST_NORMS:
            continue
        if effective_company_type(_r) in EXCLUDED_COMPANY_TYPES:
            continue
        _auto_rows.append({"parent_id": (_r.get("parent_company_id") or "").strip(),
                           "child_id": (_r.get("child_company_id") or "").strip(),
                           "name": _company})
_auto_clusters = compute_auto_merges(_auto_rows, MARKET_ID, DO_NOT_MERGE)
assert_auto_merge_invariants(_auto_clusters, MARKET_ID, DO_NOT_MERGE)
AUTO_MAP = auto_merge_map(_auto_clusters, MARKET_ID)
MERGE_MAP = {**AUTO_MAP, **CURATED_MAP}   # curated human decision wins on conflict
for _dupe_key in sorted(set(AUTO_MAP) & set(CURATED_MAP)):
    log(f"[auto-merge] curated override on {_dupe_key}")
for _c in _auto_clusters:
    log(f"[auto-merge] {_c['survivorKey']} <- {[m['key'] for m in _c['members']]}")
log(f"[auto-merge] {len(_auto_clusters)} exact-tier cluster(s) auto-merged this market")
with open(os.path.join(OUT_DIR, f"auto_merge_report_{MARKET_ID}.txt"), "w") as _rf:
    _rf.write(format_auto_merge_report(_auto_clusters, MARKET_ID))

```

(The existing grouping loop below still reads `CSV_PATH` a second time via its own `reader` — left completely unchanged.)

- [ ] **Step 4: Route override slugs through slug disambiguation**

In `pipeline.py` lines ~1607–1619, replace:
```python
    _ov = merged_override(_mkt["id"], norm, MERGE_MAP)
    if _ov:
        slug = _ov["survivorSlug"]
    else:
        base_slug = pm_slug(name)
        n_seen = seen_slugs_in_market.get(base_slug, 0)
        if n_seen == 0:
            slug = base_slug
        else:
            # n_seen=1 → next gets "-2", n_seen=2 → "-3", etc.
            slug = f"{base_slug}-{n_seen + 1}"
            slug_collisions.append((norm, base_slug, slug))
        seen_slugs_in_market[base_slug] = n_seen + 1
```
with:
```python
    _ov = merged_override(_mkt["id"], norm, MERGE_MAP)
    # A merged survivor (curated or auto) keeps its survivorSlug as the base, but
    # still passes through collision disambiguation so two survivors (or a survivor
    # and a normal op) can never share a slug.
    base_slug = _ov["survivorSlug"] if _ov else pm_slug(name)
    n_seen = seen_slugs_in_market.get(base_slug, 0)
    if n_seen == 0:
        slug = base_slug
    else:
        # n_seen=1 → next gets "-2", n_seen=2 → "-3", etc.
        slug = f"{base_slug}-{n_seen + 1}"
        slug_collisions.append((norm, base_slug, slug))
    seen_slugs_in_market[base_slug] = n_seen + 1
```

- [ ] **Step 5: Refactor the sidecar block to the shared normalization**

In `pipeline.py` lines ~1881–1898, replace:
```python
_APP_LEGAL_SUFFIXES = {"inc", "llc", "llp", "lp", "ltd", "co", "corp",
                       "corporation", "company"}
_APP_GENERIC_TOKENS = {"property", "properties", "management", "mgmt", "realty",
                       "real", "estate", "group", "homes", "home", "rentals",
                       "rental", "services", "service", "the", "of", "and"}
_PLACEHOLDER_NORMS = {"name not provided", "not provided", "unknown", "none",
                      "n a", "na", "tbd", "test"}
def _app_norm(name):
    s = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    toks = [t for t in s.split(" ") if t and t not in _APP_LEGAL_SUFFIXES]
    return " ".join(toks) or s
def _tokset(an):
    return {t for t in an.split(" ") if t}
def _distinctive_set(s):
    return len(s) >= 2 and any(t not in _APP_GENERIC_TOKENS for t in s)
def _distinctive_subset(small, big):
    # small ⊊ big and the shared core is distinctive — the tool's near-match rule.
    return 0 < len(small) < len(big) and small <= big and _distinctive_set(small)
```
with:
```python
# v0.25 — one shared normalization for the merge tool, the auto-merge, and this
# sidecar (see operator_grouping.strong_name_key / is_distinctive / GENERIC_TOKENS).
_PLACEHOLDER_NORMS = {"name not provided", "not provided", "unknown", "none",
                      "n a", "na", "tbd", "test"}
def _app_norm(name):
    return strong_name_key(name)
def _tokset(an):
    return {t for t in an.split(" ") if t}
def _distinctive_set(s):
    return len(s) >= 2 and any(t not in GENERIC_TOKENS for t in s)
def _distinctive_subset(small, big):
    # small ⊊ big and the shared core is distinctive — the tool's near-match rule.
    return 0 < len(small) < len(big) and small <= big and _distinctive_set(small)
```
(`strong_name_key`, `is_distinctive`, and `GENERIC_TOKENS` are already imported by Step 1.)

- [ ] **Step 6: e2e — run DFW through the pipeline on real data (scratch out-dir)**

Run (data dir per project convention; scratch out-dir):
```bash
cd scripts/data-pipeline && python3 pipeline.py --market dallas-fort-worth-arlington-tx \
  --config markets.json --out-dir /private/tmp/claude-501/auto-merge-e2e 2>&1 | grep -E "auto-merge|Ranked operators|Eligible PMs"
```
Expected: `[auto-merge] N exact-tier cluster(s) auto-merged this market` with N ≥ 1, `[auto-merge]` lines including the 31 Realty survivor `31871`, and the run completes (writes the market JSON). No `AssertionError`.

- [ ] **Step 7: Verify the merge landed + report written**

```bash
python3 - <<'PY'
import json, glob
p = glob.glob("/private/tmp/claude-501/auto-merge-e2e/Scorecard_Data_*dallas*.json")[0]
d = json.load(open(p))
names = [o["name"] for o in d["pms"]]
dupes = [n for n in set(names) if names.count(n) > 1]
print("31 Realty rows:", [n for n in names if "31 Realty" in n])
print("within-market duplicate names remaining:", dupes[:20], "...total", len(dupes))
PY
cat /private/tmp/claude-501/auto-merge-e2e/auto_merge_report_dallas-fort-worth-arlington-tx.txt | head -30
```
Expected: exactly one `31 Realty Property Management` row (no `…LLC` twin); the duplicate-name list is empty or only names the auto-merge deliberately left (single-token / generic); the report file lists the folded clusters with veto strings.

- [ ] **Step 8: Full Python + TS gate**

Run:
```bash
cd scripts/data-pipeline && python3 -m unittest test_operator_grouping -v
cd ../.. && npx tsc --noEmit
```
Expected: all Python tests pass; tsc clean.

- [ ] **Step 9: Commit**

```bash
git add scripts/data-pipeline/pipeline.py
git commit -m "feat(pipeline): apply exact-tier auto-merge + sign-off report

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Exporter — resolve sub-eligible fragment members

**Files:**
- Modify: `scripts/data-pipeline/export_merge_decisions.ts`
- Test: `scripts/data-pipeline/export_merge_decisions.test.ts`

**Interfaces:**
- Consumes: existing `keyForPm`, `resolveDecisions`, `nameKey`.
- Produces: `keyForFragment(f: {slug: string}) -> string`; `resolveDecisions(rows, seedPms, fragments?)` accepting an optional fragments array.

- [ ] **Step 1: Write the failing tests**

Add to `export_merge_decisions.test.ts`:
```typescript
import { keyForFragment } from "./export_merge_decisions";

test("keyForFragment strips the frag- prefix to recover the grouping key", () => {
  assert.equal(keyForFragment({ slug: "frag-name:statewidemanagement" }), "name:statewidemanagement");
  assert.equal(keyForFragment({ slug: "frag-31871" }), "31871");
});

test("resolveDecisions folds a sub-eligible fragment member (frag- slug)", () => {
  const seed = [{ slug: "big-op", name: "Big Op Property Management", marketId: "la", parentCompanyId: 700 }];
  const fragments = [{ marketId: "la", slug: "frag-name:bigoppropertymanagementllc", name: "Big Op Property Management LLC" }];
  const decisions = [{ marketId: "la", decision: "merge", canonicalName: "Big Op Property Management",
    survivorSlug: "big-op",
    memberSlugs: JSON.stringify(["big-op", "frag-name:bigoppropertymanagementllc"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed, fragments as any);
  assert.equal(skipped.length, 0);
  assert.equal(out[0].survivorKey, "700");
  assert.deepEqual(out[0].memberKeys.sort(), ["700", "name:bigoppropertymanagementllc"]);
});

test("resolveDecisions still SKIPS a slug in neither pms nor the sidecar", () => {
  const seed = [{ slug: "big-op", name: "Big Op", marketId: "la" }];
  const decisions = [{ marketId: "la", decision: "merge", canonicalName: "Big Op",
    survivorSlug: "big-op", memberSlugs: JSON.stringify(["big-op", "frag-name:ghost"]) }];
  const { decisions: out, skipped } = resolveDecisions(decisions as any, seed, []);
  assert.equal(out.length, 0);
  assert.equal(skipped.length, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test scripts/data-pipeline/export_merge_decisions.test.ts`
Expected: FAIL — `keyForFragment` not exported; `resolveDecisions` ignores the 3rd arg so the fragment slug is unresolvable and the decision is skipped.

- [ ] **Step 3: Implement the exporter fix**

In `export_merge_decisions.ts`:

Add the `FragmentRow` interface and `keyForFragment` near `keyForPm`:
```typescript
interface FragmentRow { marketId: string; slug: string; name?: string; }

// A sub-eligible fragment's slug is literally `frag-<within_market_key>` (see
// pipeline.py merge_fragments emission), so the grouping key is the suffix.
export function keyForFragment(f: FragmentRow): string {
  return f.slug.replace(/^frag-/, "");
}
```

Change `resolveDecisions` to accept fragments and index them into `keyBySlug`:
```typescript
export function resolveDecisions(rows: DbDecision[], seedPms: SeedPm[], fragments: FragmentRow[] = []) {
  const keyBySlug = new Map<string, string>(); // `${market}::${slug}` -> parent-id | `name:<k>`
  for (const p of seedPms) keyBySlug.set(`${p.marketId}::${p.slug}`, keyForPm(p));
  for (const f of fragments) keyBySlug.set(`${f.marketId}::${f.slug}`, keyForFragment(f));
  // ...rest unchanged...
```

In `main()`, load the sidecar and pass it through:
```typescript
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/data/scorecard_data.json"), "utf8"));
  const fragmentsPath = path.join(__dirname, "../../src/data/merge_fragments.json");
  const fragments = fs.existsSync(fragmentsPath)
    ? (JSON.parse(fs.readFileSync(fragmentsPath, "utf8")).fragments ?? [])
    : [];
  const { decisions, skipped } = resolveDecisions(rows as any, seed.pms, fragments);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test scripts/data-pipeline/export_merge_decisions.test.ts`
Expected: PASS (all 5 pre-existing + 3 new tests).

- [ ] **Step 5: tsc gate**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/data-pipeline/export_merge_decisions.ts scripts/data-pipeline/export_merge_decisions.test.ts
git commit -m "fix(pipeline): resolve sub-eligible fragment members in merge-decision export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full pipeline Python suite: `cd scripts/data-pipeline && python3 -m unittest discover -v` (or at minimum `test_operator_grouping`) — all pass.
- [ ] `npx tsc --noEmit` clean; `npx tsx --test scripts/data-pipeline/export_merge_decisions.test.ts` passes.
- [ ] e2e DFW run shows the 31 Realty fold + a non-empty auto-merge report + no residual within-market duplicate names (beyond the intentional single-token/generic tail).
- [ ] Whole-branch review (superpowers:requesting-code-review) on `feat/exact-tier-auto-merge` — no Critical/Important findings.

## Notes for the executor

- **Sign-off gate is a process step, not a code gate:** the per-market `auto_merge_report_*.txt` files produced by the full refresh are what Jonas reviews before `merge.py --apply` commits the seed. Rejections go into `do_not_merge.json` (strong-norm form, exactly as printed in the report) and that market re-runs.
- **This does not touch the live DB or the next deploy.** It lands on the next full all-markets refresh + re-seed (pending Jonas's data exports).
- **Do not run a targeted single-market re-merge into the committed seed** — source-drift risk (see the pipeline-source-drift note). The e2e run uses a scratch out-dir and is discarded.
