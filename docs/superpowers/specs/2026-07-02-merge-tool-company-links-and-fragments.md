# Merge tool: Dwellsy company-page links + surfacing mergeable sub-eligible fragments

_Design spec — 2026-07-02. Enhancement to the operator-merge tool
([2026-07-02-operator-merge-tool-design.md](2026-07-02-operator-merge-tool-design.md))._

## Problem

Two gaps in the admin merge tool (`/admin/merges`):

1. **No way to confirm a merge from source.** Reviewers eyeball operator
   names + T12 counts but can't see the underlying Dwellsy listings/company to
   confirm two records are truly the same operator.

2. **The tool only sees operators that are already ranked.** The pipeline
   writes seed records **only** for eligible operators (`t12_listings >=
   ELIG_T12_MIN`, currently 30, plus a ≥3-address diversity rule). Verified
   against the live seed: all 3,582 operators have T12 ≥ 30; zero below. So
   fragments of a real operator that individually fall under 30 are invisible —
   even though, merged, they may clear the bar. Example: "Blue Atlas Realty" in
   Dallas has **six** `child_company_id`s; four are ranked and shown (T12
   195/164/93/30), two (`84893`, `89828`) sit below the line and never appear.
   An operator whose fragments are *each* sub-30 but *together* ≥30 is missing
   from the rankings entirely.

## Root cause of fragmentation (context)

The pipeline groups operators by `effective_company_id` = `parent_company_id`
when present, else `child_company_id` (`pipeline.py:176`). Standalone PMs have a
blank parent, so each distinct `child_company_id` becomes its own operator
record. Dwellsy itself issues multiple `child_company_id`s for one operator, so
one real operator fragments into several records. The Dwellsy consumer company
page is keyed on that same `child_company_id`:
`https://dwellsy.com/company/<child_company_id>` → the operator's real profile
(address, website, active listings). Confirmed: `.../company/191930` →
Blue Atlas Realty.

## Solution overview

One PR, two intertwined parts, riding a single deterministic pipeline re-run.

### Part A — Dwellsy company-page links

- **`pipeline.py`**: emit `companyId` on every operator = the effective grouping
  id (the `norm` handle when it is a real company id; `null` for the rare
  name-fallback operators on old-schema CSVs). One field beside the existing
  `parentCompanyId`.
- **`merge.py`**: no change — it passes operator fields through untouched (only
  reassigns `canonicalOperatorId`), so `companyId` reaches the seed.
- **`schema.prisma`**: add `companyId String?` to `PM` (+ migration). The merge
  loader reads columns, not the JSON blob, so this must be a real column.
  (`parentCompanyId` lives only in the blob because nothing at runtime needs it;
  `companyId` is different.)
- **`seed.ts`**: map `companyId` into the PM `create` block.
- **`MergeClusterCard.tsx`**: per member, a **"View on Dwellsy ↗"** link →
  `https://dwellsy.com/company/<companyId>`, shown only when an id exists.

### Part B — surface sub-eligible fragments, filter to combined ≥ 30

**Data — a merge-tool sidecar.** `pipeline.py` writes a second output,
`src/data/merge_fragments.json`: the **sub-eligible** operators (T12 below
`ELIG_T12_MIN`) that carry a company id. Fields per fragment: `marketId`,
`companyId`, `name`, `slug` (synthetic, `frag-<companyId>` — globally unique,
no collision with an eligible PM of the same name, and lets the future apply
step recover the id), `t12ListingsCount`, `operatorType`. The sidecar shape:

```json
{ "generatedAt": "...", "methodologyVersion": "v0.6.4",
  "fragments": [ { "marketId": "...", "companyId": "84893",
    "name": "Blue Atlas Realty", "slug": "frag-84893",
    "t12ListingsCount": 17, "operatorType": "pm" }, ... ] }
```

**Isolation (key safety property).** Sidecar stubs are **never written to the
`PM` table** and never enter `scorecard_data.json`. They cannot leak into
rankings, scorecards, search, briefs, Ask AI, or entitlements — the sidecar is
read *only* by the merge-tool server loader.

**Emission rule (finalized after Dallas pilot).** A liberal "any id-bearing
sub-eligible op" emitted 4,476 rows for Dallas — mostly isolated individual
landlords that never cluster. The final rule mirrors the two ways the tool
clusters, so the sidecar carries only fragments that can actually surface. Emit
a sub-eligible (T12 below cutoff), id-bearing operator with T12 ≥ 1 when its
name is **distinctive** (≥2 tokens, ≥1 non-generic — the tool's `distinctiveCore`
guard, which drops bare first names like "David"/"Mike" and pure generics) and
non-placeholder, **AND** either:
- its normalized name is shared by ≥1 other in-market operator (eligible or
  another candidate) — covers exact rescue pairs + exact satellites; or
- it is a distinctive token-subset (either direction) of an **eligible**
  operator — covers near-match satellites (e.g. "Auben Realty - DFW" ↔ "Auben
  Realty").

The pipeline mirrors the app's `normalizeOperatorName` exactly so it never
under-emits. Result: Dallas 4,476 → **497** fragments (~85 KB), with identical
shown-cluster coverage (54 clusters, 46 including a fragment). **Documented v1
gap:** fragment↔fragment *near-match* rescues (two differently-named
sub-eligible fragments) are not emitted — rare, and addable later if needed.

**Clustering + filter (app).** `loadAllMergeCandidates()` reads eligible PMs
(from the DB, now with `companyId`) **plus** the sidecar stubs, tags each
member `eligible: true|false`, and clusters them together with the existing
exact/possible logic. One new rule in `findMergeCandidates`: **keep a cluster
only when the members' combined T12 ≥ `ELIG_T12_MIN`.**

Effect on today's data — additive and non-regressive:
- All-eligible clusters (current behavior) always sum ≥30 → unchanged.
- Ranked operator + hidden satellites → shown, so a merge can be complete.
- Several sub-eligible fragments that clear 30 only together → newly surfaced.
- Fragments that stay under 30 even combined → stay hidden (the requested guard).

**Card.** Sub-eligible members get a muted **"not yet ranked · N listings"**
badge; the Dwellsy link works for them too. Survivor default stays "most
listings"; a sub-eligible fragment can still be chosen as survivor (rare).

### Downstream (out of scope — PR2, the "apply" half)

When an approved merge includes sub-eligible fragments, the offline apply pools
**all** member listings (eligible + hidden) by `companyId` and recomputes; a
merged operator that clears 30 gains a full scorecard and enters the rankings.
This PR only surfaces + filters + links.

## Data flow

```
CSV rows ──pipeline.py──> per-market JSON (eligible ops, now w/ companyId)
                     └──> merge_fragments.json (sub-eligible id-bearing stubs)
per-market JSON ──apply_canonicals──> merge.py --apply ──> scorecard_data.json
scorecard_data.json ──seed.ts──> PM table (companyId column)
PM table + merge_fragments.json ──loadAllMergeCandidates──> findMergeCandidates
   (tag eligible, cluster, filter combined≥30) ──> MergeClusterCard
```

## Testing

- `merge-candidates.test.ts` (pure, `npm run test:watch-list`): add cases —
  (a) all-eligible cluster survives (combined ≥30); (b) sub-eligible pair whose
  combined ≥30 forms a cluster; (c) sub-eligible pair whose combined <30 is
  dropped; (d) ranked + sub-eligible satellite forms a cluster; (e) `companyId`
  and `eligible` carried onto members; existing 9 cases still pass.
- Server loader + card: not unit-tested (Prisma + RSC), verified on Vercel
  preview, consistent with repo convention.

## Re-run + acceptance gate

Re-run 33 markets → re-apply canonicals (p1–p7) → `merge.py --apply` →
regenerate `scorecard_data.json` + `markets-summary.json` + emit
`merge_fragments.json`. **Acceptance gate:** diff new seed vs current — the only
per-operator changes may be the new `companyId` field and volatile
`generatedAt` timestamps. Any change to ranks/stars/metrics/counts/canonical ids
= stop and investigate. Pipeline is deterministic (`PYTHONHASHSEED=0`), so the
diff should be clean. `methodologyVersion` stays `v0.6.4` (drift guard passes).
