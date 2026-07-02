# Admin operator-merge tool — design

**Date:** 2026-07-02
**Status:** approved

## Problem

Within a market, the same operator is often recorded as several separate
records (distinct source `child_company_id`s, no shared `parent_company_id`),
differing only by punctuation / legal suffix / an appended agent name — e.g.
Richmond has ~7 "KRS Holdings" variants. A strict sweep found ~280 exact-name
duplicate clusters across the 33 markets. This inflates operator counts, splits
one operator's listings/share across records, and pollutes the cohorts that
drive star thresholds.

The pipeline keys standalone operators by `child_company_id` **deliberately**
(to keep genuinely-different same-name firms apart), so auto-merging by name
carries a false-merge risk. Decision: **human-curated merges only** — a tool
surfaces candidates; a person decides.

## Non-goals (YAGNI)

- No automated merges — every merge is a human decision.
- No live in-app record merging — correct pooled metrics only come from the
  offline pipeline, so the tool captures decisions and the pipeline applies them.
- No cross-market merging — same-market only.

## Apply model

Queue decisions → pipeline re-run. The tool records human decisions in the DB.
Offline (same cadence as pipeline runs) they are exported to a curated
decisions file, the pipeline re-pools the merged operators' raw listings and
recomputes all metrics/stars/cohorts, then re-merge + re-seed. Correct numbers;
single source of truth; merges appear after the next re-seed.

## Components

### 1. Candidate detection (pure, unit-tested)
`src/lib/operators/merge-candidates.ts`. Input: the market's operators
(name, slug, listing count, quadrant, claimed, canonicalOperatorId). Output:
clusters, each tagged confidence tier:
- **exact** — names equal after normalize (lowercase, strip punctuation +
  legal-suffix tokens: inc/llc/llp/lp/ltd/co/corp/corporation/company).
- **possible** — near-match: one normalized name's token-set is a subset of
  another's, or they share a distinctive multi-word core (catches
  "Jamie Bright, KRS Holdings"). Generic-token-only overlaps are excluded to
  avoid noise.
Excludes clusters already sharing a `canonicalOperatorId`, and any cluster
whose `clusterKey` has a stored decision (merge or dismiss).

### 2. Data model
New Prisma model `OperatorMergeDecision`:
`{ id, marketId, clusterKey (normalized-name identity), canonicalName,
survivorSlug, memberSlugs (JSON string[]), decision "merge"|"dismiss",
decidedByUserId, createdAt, updatedAt }`, unique on `(marketId, clusterKey)`.
Migration adds the table only.

### 3. Admin UI
New **"Merges"** tab under `/admin` (in `AdminTabs`), page at
`/admin/merges`. Admin-guarded (`isAdminUser`), `force-dynamic`. Grouped by
market, high-confidence tier first; per cluster: member rows (name · listings ·
quadrant · claimed), a survivor selector (default = most listings), an editable
canonical-name field (prefilled with the cleanest spelling), **Merge** and
**Dismiss** actions. Client component mirrors the existing admin-form pattern
(`useActionState`).

### 4. Server actions
`src/app/admin/merges/actions.ts`: `recordMergeDecision` and
`dismissCluster` — both re-check `isAdminUser`, upsert on
`(marketId, clusterKey)`, `revalidatePath`.

### 5. Apply flow (offline — second PR)
- Export `decision="merge"` rows → `scripts/data-pipeline/merge_decisions_<v>.json`
  (auditable in git; mirrors the `canonical_decisions` pattern).
- Pipeline **merge pass**: after per-operator accumulation, combine the groups
  named in a decision (pool raw tallies), stamp canonical name/slug, then
  compute metrics on the merged operator. Join on the current operator slug
  (deterministic from name); child-company-id is a future hardening if slugs
  drift between review and run.

## Build order

PR1 (this): candidate lib + tests, `OperatorMergeDecision` model + migration,
admin page + tab + actions + client UI.
PR2: export script + pipeline merge pass + pilot verification.

## Verification

Unit-test the candidate clustering with fixtures (KRS-style exact + agent
near-match + a coincidental-generic-name non-cluster). tsc + eslint + full
build on the Vercel preview.
