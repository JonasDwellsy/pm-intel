# Exact-Tier Auto-Merge (Fragment Merge Phase 1.5) — Design

**Date:** 2026-07-08
**Status:** Approved for planning
**Related:** [[within-market-fragment-merge]] (Phase 1 #166, Phase 2 #170, parent-keyed capability #176), `docs/superpowers/specs/2026-07-06-within-market-fragment-merge-design.md`, `docs/superpowers/specs/2026-07-07-fragment-merge-phase2-design.md`

## Problem

Within a market the same operator still appears as two ranked records when the two records differ only by a legal suffix or by the parent/no-parent boundary. Running the real merge-tool clustering (`findMergeCandidates`) over the current seed finds **79 exact-tier clusters (158 operators)** — identical after stripping legal suffixes and punctuation — plus 36 possible-tier clusters (78 operators) that need human judgment.

Two root causes, both in `scripts/data-pipeline/operator_grouping.py`:

1. **`name_key` keeps legal suffixes.** The no-parent grouping key is `name:{name_key(name)}`, and `name_key` (from `tenancy_survival.py`) is lowercase-alphanumeric-only — it *keeps* `"llc"`. So `"Spectrum Realty Services"` → `name:spectrumrealtyservices` and `"Spectrum Realty Services, LLC"` → `name:spectrumrealtyservicesllc` never pool. This accounts for **16** of the 79 (all-no-parent).
2. **Parent/no-parent boundary.** A parent-keyed row keys by its parent id; a no-parent row keys by name. Even *identical* names on opposite sides of that boundary never pool. **63** of the 79 involve at least one parent-keyed member (e.g. the 31 Realty case, #176).

The dupes must be gone to ship. Hand-curating all 115 clusters is slow and error-prone; the 79 exact clusters are unambiguous (same company) and should resolve automatically, leaving only the 36 judgment cases for the human tool.

Separately, the Phase-2 curated-merge exporter (`export_merge_decisions.ts`) **silently skips** any curated decision whose member is a sub-eligible fragment (slug `frag-<key>`, not in the seed's `pms`). A pre-existing LA decision hits this. It blocks curating any possible-tier cluster that includes a not-yet-ranked fragment.

## Goal

1. **Auto-merge the exact tier.** Any two+ operators in a market whose names are identical after suffix/punctuation stripping — and whose shared name is *distinctive* — fold into one operator automatically, at pipeline time, with no human decision.
2. **Unblock possible-tier curation.** Fix the exporter so a curated decision can reference a sub-eligible fragment.

Non-goals: the 36 possible-tier clusters (stay human-curated in the admin tool); cross-market canonical linking (a separate system in `merge.py`, untouched); changing eligibility, metrics, or any scorecard field semantics.

## Decisions (locked with Jonas)

- **Distinctiveness guard ON.** Auto-merge fires only when the shared strong-norm has `≥2 tokens AND ≥1 non-generic token`. A purely-generic identical-name collision (`"Property Management"` × 2) never auto-merges; it falls back to human curation. (Expected to drop 0 of today's 79 — all have distinctive tokens — so it is near-free insurance for future refreshes.) **Consequence:** a single-token identical name (`"Redfin"` / `"Redfin LLC"`) is *not* distinctive under the `≥2 tokens` rule and so is **not** auto-merged — the tool would still surface it as an exact cluster for human curation. Multi-token names dominate PM operators, so this is a small, deliberate tail left to curation.
- **Human sign-off gate ON.** The audit emits the full `survivor ← members` list; Jonas reviews before the refresh applies it. Rejections use the **existing `do_not_merge.json`** escape hatch — no new gate machinery.
- **Approach B (computed auto-merge map).** Compute `merge_map` entries in a pipeline pre-pass and feed them through the plumbing #176 already built (`within_market_key` consults the map in both branches; `merged_override` sets canonical name + survivor slug). The curated `merge_decisions.json` overlays on top and wins on any key conflict.

## Architecture

One new module of pure logic in `operator_grouping.py`, one integration point in `pipeline.py`, one new audit mode, and one independent exporter fix. No schema changes, no new committed data artifact, no deploy-time (`db seed`) change — `merge_decisions.json` and the computed map are pipeline inputs only, so this lands on the **next full pipeline refresh + re-seed**, not the next deploy.

### Component 1 — Shared normalization helpers (`operator_grouping.py`)

Two pure functions, mirroring the TS merge tool (`normalizeOperatorName` in `src/lib/operators/merge-candidates.ts`) and the pipeline's inline sidecar logic (`_app_norm`/`_distinctive_set`), so all three finally share one definition:

```python
LEGAL_SUFFIXES = {"inc", "llc", "llp", "lp", "ltd", "co", "corp",
                  "corporation", "company"}
GENERIC_TOKENS = {"property", "properties", "management", "mgmt", "realty",
                  "real", "estate", "group", "homes", "home", "rentals",
                  "rental", "services", "service", "the", "of", "and"}

def strong_name_key(name):
    """Lowercase, non-alnum -> space, drop legal-suffix tokens, join with
    space. ASCII-only ([^a-z0-9]+), matching TS normalizeOperatorName — which
    also closes the latent accented-char name_key parity gap on this path."""
    s = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    toks = [t for t in s.split(" ") if t and t not in LEGAL_SUFFIXES]
    return " ".join(toks) or s

def is_distinctive(strong_norm):
    """>=2 tokens AND >=1 token outside GENERIC_TOKENS (the tool's
    _distinctive_set). Purely-generic names are not auto-merged."""
    toks = [t for t in strong_norm.split(" ") if t]
    return len(toks) >= 2 and any(t not in GENERIC_TOKENS for t in toks)
```

Values are copied verbatim from `merge-candidates.ts`. The sidecar block in `pipeline.py` (currently `_APP_LEGAL_SUFFIXES`, `_APP_GENERIC_TOKENS`, `_app_norm`, `_distinctive_set`) is refactored to import and call these — removing the duplicate definitions. The sidecar's placeholder set (`_PLACEHOLDER_NORMS`) stays where it is; it is a sidecar concern, distinct from grouping's `PLACEHOLDER_NAME_KEYS`.

### Component 2 — Auto-merge computation (`operator_grouping.py`)

```python
def compute_auto_merges(rows, market_id, do_not_merge):
    """rows: iterable of dicts with keys parent_id, child_id, name — the
    market's post-exclusion operator rows. Returns a deterministic list of
    cluster dicts {strong, survivorKey, canonicalName, survivorSlug,
    members:[{key,name,had_parent}]} for every EXACT-tier auto-merge.
    No metrics/listings required."""

def auto_merge_map(clusters, market_id):
    """clusters -> {(market_id, member_key): {survivorKey, canonicalName,
    survivorSlug}}, survivor mapping to itself — the exact shape
    load_merge_decisions produces, so within_market_key / merged_override
    consume it unchanged."""
```

(Split into two functions so the same `clusters` feed the map, the invariant assertion, and the sign-off report.)

Algorithm:
1. For each row, compute `base_key = within_market_key(parent_id, child_id, name, market_id, do_not_merge, None)` (map-free — so `within_market_key`'s own logic is the mergeability oracle) and `strong = strong_name_key(name)`.
2. **Mergeability filter (this is what protects placeholders and the Phase-1 denylist):** a row is a merge candidate only if `had_parent = bool(parent_id.strip())` **or** `base_key.startswith("name:")`. A row that had no parent and whose base_key is a bare child id was *deliberately kept unpooled* by `within_market_key` — it is a placeholder/blank name (`PLACEHOLDER_NAME_KEYS`) or a `name_key`-denylisted name. Skipping those rows means auto-merge never pools `"Company Name Not Provided"` fragments and always respects the existing name-pooling denylist. Non-candidate rows are dropped before grouping.
3. Group the surviving candidates' distinct `base_key`s by `strong`. Track per base_key: `had_parent`, and a representative display `name`.
4. A `strong` is an auto-merge iff: `is_distinctive(strong)` **and** `(market_id, strong) not in do_not_merge` (the strong-norm veto, below) **and** it has **≥2 distinct base_keys**.
5. For each qualifying `strong`, choose the survivor and emit one entry per member base_key → survivor, **including the survivor's own key mapping to itself** (matching `load_merge_decisions`, so `merged_override` returns the display for the survivor key).

Survivor / canonical rules (deterministic, no listing counts) — decoupled exactly as #176 did (grouping identity vs display):
- **survivorKey** (durable grouping identity) — a parent-id base_key if any candidate had a parent (most durable across refreshes); if several, the numerically lowest; otherwise the canonical member's `name:` key. Generalizes the 31 Realty choice (`survivorKey="31871"`).
- **canonicalName** (display) — the member display name with the **fewest legal-suffix tokens** (so `"31 Realty Property Management"` beats `"…LLC"`); tiebreak: lexicographically smallest display name. Independent of survivorKey (mirrors #176, where `survivorKey="31871"` but `canonicalName` was the non-LLC form).
- **survivorSlug** — computed inline in the pure function as `re.sub(r"[^a-z0-9]+","-", canonicalName.lower()).strip("-") + f"-{market_id}"`, which is byte-for-byte what `pipeline.py`'s `pm_slug` would produce (`pm_slug` lowercases, so display-casing differences vanish). Kept inline so `operator_grouping.py` stays pure (no dependency on the pipeline's `MARKET_ID` global). The pipeline's slug loop now routes this survivorSlug through collision disambiguation too (a small refinement that also hardens curated overrides).

**`do_not_merge` (the sign-off veto) — two normalization forms in one file, non-interfering.** `within_market_key`'s Phase-1 check matches `(market, name_key(name))` — space-free, suffix-*kept*. The auto-merge veto here matches `(market, strong_name_key(name))` — space-separated, suffix-*stripped*. A multi-token strong-norm (e.g. `"spectrum realty services"`) contains spaces and therefore can **never** equal a space-free `name_key`, so a veto entry added for an auto-merge affects only the auto-merge path and is a no-op for `within_market_key`. Single-token strong-norms are never distinctive (see below) so are never emitted as auto-merges — no veto entry for one is ever needed. The audit report prints the exact `normalizedName` string to paste, removing any ambiguity about which form to write.

### Component 3 — Pipeline integration (`pipeline.py`)

A self-contained pre-pass is inserted immediately BEFORE the grouping loop's `with open(CSV_PATH …)` (line ~467). It opens the CSV itself (a cheap second read — the main loop is left byte-for-byte unchanged, avoiding any re-indent of the hot loop), applies the *same* exclusion filters the loop uses (`msa_code`, non-empty `company_name`, `_DENYLIST_NORMS`, `EXCLUDED_COMPANY_TYPES`), builds the row dicts, and computes + applies the map:

```python
# (module-level, just before the grouping loop; CURATED_MAP was renamed from
#  the old MERGE_MAP load at line ~126)
_auto_clusters = compute_auto_merges(_auto_rows, MARKET_ID, DO_NOT_MERGE)
assert_auto_merge_invariants(_auto_clusters, MARKET_ID, DO_NOT_MERGE)
AUTO_MAP  = auto_merge_map(_auto_clusters, MARKET_ID)
MERGE_MAP = {**AUTO_MAP, **CURATED_MAP}   # curated human decision wins on conflict
```

`MERGE_MAP` then flows unchanged into `within_market_key(...)` (line ~507) and `merged_override(...)` (lines ~515, ~1251, ~1607). Log one line per applied auto-merge: `[auto-merge] <survivorKey> <- [members]`, a summary count, and `[auto-merge] curated override on <key>` for any key present in both maps.

The `name` passed to `compute_auto_merges` is `company_name` (col 8) — the same string `within_market_key` normalizes at line ~507 — so base_keys computed in the pre-pass exactly match the loop's keys.

### Component 4 — Invariant audit + sign-off report (in the pipeline)

Rather than a separate all-markets differ (which would duplicate the pipeline's row-filtering and risk drift), the audit is realized *inside* the pipeline's per-market run — the refresh already iterates every market, so its reports collectively are the all-markets sign-off list. It:
- **Asserts invariants on every invocation** (`assert_auto_merge_invariants`, pure, in `operator_grouping.py`), failing the run loudly if any break:
  - `is_distinctive(strong)` holds for every emitted cluster;
  - no `(market, strong)` in `do_not_merge` is emitted;
  - every cluster has ≥2 distinct member keys and survivorKey is one of them;
  - no member key appears under two different strong-norms (no cross-norm bleed);
  - no two distinct survivors in a market share a `survivorSlug`.
- **Writes a per-market review report** (`auto_merge_report_<market>.txt` in the pipeline out-dir, via `format_auto_merge_report`) listing each `canonicalName  <-  member1[key], member2[key] …` with raw member names, plus the exact `do_not_merge.json` veto string to paste to reject it.

Sign-off loop: the full refresh writes one report per market; Jonas reads them before `merge.py --apply` commits the seed. Any merge he rejects → add the printed `{marketId, normalizedName: <strong_norm>}` to `do_not_merge.json` → re-run that market. When the reports read clean, `merge.py --apply` lands exactly that list. (The existing `audit_fragment_merge.py` before/after seed differ stays available as a complementary post-refresh check and is not modified.)

### Component 5 — Exporter sub-eligible-fragment fix (`export_merge_decisions.ts`, independent)

The resolver builds `keyBySlug` from seed `pms` only, so a `frag-<key>` member slug resolves to `undefined` and the whole decision is skipped. Fix:
- Load `src/data/merge_fragments.json` alongside the seed.
- Add each sidecar row to `keyBySlug` as `${marketId}::${slug} -> <key>`, where `<key>` is the slug with the `frag-` prefix removed (the sidecar slug is literally `frag-{within_market_key}`, so the suffix *is* the grouping key).
- Behavior preserved: a genuinely unknown slug (in neither `pms` nor the sidecar) still resolves to `undefined` → decision skipped with the existing warning.

This lets a curated possible-tier decision fold a sub-eligible fragment into a ranked survivor, resolving the pre-existing LA skip.

## Data flow

```
source CSV (per market)
  ├─ pre-pass:  rows → compute_auto_merges → clusters
  │                     (strong_name_key + is_distinctive + survivor rules)
  │                     → auto_merge_map(clusters) → AUTO_MAP
  │                     → assert_auto_merge_invariants(clusters)   (raises on violation)
  │                     → format_auto_merge_report(clusters) → auto_merge_report_<market>.txt
  ├─ MERGE_MAP = {**AUTO_MAP, **CURATED_MAP}         (curated wins)
  └─ grouping loop:  within_market_key(row, …, MERGE_MAP)  → pooled operators
                     merged_override(…, MERGE_MAP)         → canonical name + slug
                          ↓
                     metrics recompute over pooled listings (unchanged)
                          ↓
                     seed scorecard_data.json  →  db seed on deploy

sign-off (per market, from the refresh):  read auto_merge_report_<market>.txt
                      rejections → do_not_merge.json → re-run that market → merge.py --apply

curated tool path (independent):
  OperatorMergeDecision → export_merge_decisions.ts (now resolves frag-* slugs)
                        → merge_decisions.json → CURATED_MAP
```

## Testing

**Python unit (`test_operator_grouping.py`):**
- `strong_name_key`: suffix stripping (`"X, LLC"` → `"x"`), punctuation, multi-token, accented char yields ASCII-only, empty/placeholder → falls through to `s`.
- `is_distinctive`: `"property management"` → False; `"31 realty property management"` → True; single token → False.
- `compute_auto_merges` (+ `auto_merge_map` shape):
  - name↔name (both no-parent, suffix-only diff) → entries for both member keys + survivor→itself; survivor = canonical member's `name:` key, canonical = suffix-free.
  - name↔parent (the 31 Realty shape) → survivor = parent-id, both member keys (and the parent id itself) map to it, canonical = suffix-free.
  - parent↔parent (two parent-ids, same strong-norm) → survivor = lowest parent-id.
  - **placeholder regression guard:** two no-parent `"Company Name Not Provided"` rows (distinct child ids) → **no entry** (mergeability filter drops them; `strong_name_key` strips `"company"` so the distinctiveness guard alone would *not* catch them — this test locks that in).
  - **denylist respect:** a `name_key`-denylisted no-parent name → its rows are non-candidates → no entry.
  - non-distinctive shared name (`"property management"`) → no entry.
  - single-token shared strong-norm (`"redfin"`) → no entry (not distinctive).
  - `(market, strong_norm)` in `do_not_merge` (space-separated form) → no entry (the sign-off veto).
  - single base_key for a strong-norm → no entry.
  - canonical display prefers the fewest legal-suffix tokens, decoupled from survivorKey (survivor may be a parent-id while canonical is a suffix-free no-parent name).

**TS unit (`export_merge_decisions.test.ts`):**
- a member slug `frag-name:foo` (present in the fragments fixture) resolves to `name:foo`; the decision is emitted.
- a member slug in neither `pms` nor the sidecar → decision still skipped with warning.

**e2e (scratch pipeline run, real DFW data):**
- the 31 Realty pair and its exact-tier siblings fold to one operator each; ranked operator count drops; no residual dupes; `[auto-merge]` log lines present.
- the run's inline invariants pass (no `AssertionError`) and a non-empty `auto_merge_report_dallas-fort-worth-arlington-tx.txt` is written to the out-dir.

## Risks & mitigations

- **Over-merging (false positive).** Four layers: the mergeability filter (placeholders + `name_key`-denylisted names never enter, reusing `within_market_key`'s own decisions) + the distinctiveness guard + the `do_not_merge` strong-norm veto + the sign-off report backed by the invariant audit. Same 0-false-merge bar Phase 1 (#166) cleared; strong-norm is a modest broadening of Phase 1's name_key pooling (adds only suffix/punct-differing pairs).
- **Source drift on a partial re-merge.** Do not target single markets. This lands only in a **full all-markets refresh** (which regenerates prose), per [[pipeline-source-drift]].
- **Slug churn.** survivorKey prefers a durable parent-id; survivorSlug is the natural `pm_slug(canonicalName)`, and the pipeline's existing collision loop disambiguates. Auto-merges reduce, not increase, slug count.
- **Fragment member-key instability (export fix).** A `frag-<child_id>` member key is only as stable as the churning child id. Name-keyed and parent-keyed fragments are stable; child-id-keyed sub-eligible members are inherently a re-curation risk — acceptable for now and noted, not solved here.

## Rollout

Code merges to `main` behind the pipeline (no deploy effect). Application happens on the next full all-markets refresh + re-seed (pending Jonas's data exports), gated by the sign-off report. The exporter fix is independent and lands with the same PR (or its own), effective the next time the exporter runs.
