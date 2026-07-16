# Admin Operator-Name Corrections — Design

**Date:** 2026-07-16
**Status:** Approved (design); ready for implementation plan
**Author:** Jonas + Claude

## Problem

Operator (property-manager / broker) display names originate from the Dwellsy
source CSV and flow through the pipeline into the committed seed
(`src/data/scorecard_data.json`). When a name is wrong — a typo, bad casing the
acronym allowlist doesn't catch, or a garbled entity name — the only ways to fix
it today are:

1. Edit a pipeline curation file (`pm_name_acronyms.json`, or a `nameOverrides`
   block in `canonical_decisions_*.json`) and run a full pipeline refresh — which
   requires the ~15 GB source data that lives only on Jonas's laptop.
2. Go through the admin **merge** tool, which can set a group name but only as a
   side effect of merging operators.

There is no low-friction, admin-driven way to just correct a name. This feature
adds one.

**A direct DB edit is not an option:** `vercel-build` runs `prisma db seed`,
which does a hard `prisma.pM.deleteMany()` + `create(...)` from the seed JSON on
every deploy (`prisma/seed.ts`). Any name edited straight into the `PM` /
`CanonicalOperator` rows is wiped on the next deploy.

## Goals

- Correct an operator's **display name** from the admin panel.
- The correction is **immediate** (visible on the next page load, no deploy) and
  **permanent** (survives every future reseed).
- Cover **any** operator: a standalone single-market operator (incl. brokers),
  AND a multi-market canonical group (fixing the group name once fixes it in all
  member markets).
- No laptop / pipeline dependency for the core correction.

## Non-goals

- Changing an operator's **URL / slug**. A correction changes the displayed name
  only; `slug` and `canonicalOperatorId` are untouched so existing links,
  bookmarks, and shared scorecard URLs keep working.
- Merging / splitting operators (that's the existing merge tool).
- Fixing operator **type** (pm vs broker) — that's `operator_type_overrides.json`.
- **Phase 1 does not update** search autocomplete, generated PDFs, or briefs
  (see "Known scope boundary" and "Phase 2").

## Approach

**A dedicated corrections table is the single source of truth**, applied through
two appliers (a live one and a durable one). This mirrors the merge tool's
established philosophy ("the app records intent; something else applies it")
while adding a live layer so the edit shows immediately.

Rejected alternative — **read-time overlay** (swap names at query time, no table
patching): it cannot fix the static pre-built artifacts (search index, PDFs,
briefs are files, not DB reads) *and* it forces the override through every read
path (list rows, scorecard header, operator page, AI, search), multiplying the
surfaces that can drift out of sync. The write-path patch touches a bounded,
enumerable set of denormalized columns instead.

Rejected alternative — **pipeline-only (merge-tool clone)**: not live, and keeps
the laptop/pipeline friction this feature exists to remove.

## Data model

New Prisma model **`OperatorNameCorrection`**, deliberately **excluded from the
seed's `deleteMany` set** (like `OperatorMergeDecision` and `AppSetting`) so a
reseed cannot wipe it.

```prisma
model OperatorNameCorrection {
  id             String   @id @default(cuid())
  // "pm" = a single operator in one market; "canonical" = a multi-market group.
  targetKind     String
  // For "pm": the PM slug (globally unique — slugs are market-suffixed).
  // For "canonical": the canonicalOperatorId.
  targetKey      String
  correctedName  String
  // The name at correction time — powers Undo and staleness detection.
  originalName   String
  decidedByUserId String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([targetKind, targetKey])
}
```

## Where a name is denormalized (what each applier must patch)

The exploration found a name lives in up to four places, all sourced from the
seed JSON:

- `PM.name` — the column; used by market PM-list rows (`toPmListItem` in
  `src/lib/slugify.ts`).
- `PM.scorecardData` (JSON blob) — its embedded `pm.name` is what the **scorecard
  header** renders (`view-model.ts` → `ScorecardHeader.tsx`), NOT the column.
- `CanonicalOperator.canonicalName` — the multi-market group's display name
  (operator-level page, `src/lib/.../lookup.ts`).
- `PM.canonicalOperatorName` — per-member group name (the DBA-alias display in
  `toPmListItem`).

**Correction targets → columns patched:**

- **`targetKind = "pm"`** (key = PM slug): set `PM.name` and rewrite the
  `pm.name` field inside that row's `scorecardData` blob.
- **`targetKind = "canonical"`** (key = canonicalOperatorId): set
  `CanonicalOperator.canonicalName` and every member `PM.canonicalOperatorName`.

Edge case for the plan: `toPmListItem` shows `canonicalOperatorName` as a DBA
alias only when it differs case-insensitively from `name`. The correction logic
must not introduce a spurious alias — when correcting a standalone PM's name,
keep `name` and `canonicalOperatorName` consistent.

## The two appliers

### 1. Live applier (on save) — immediate

The admin server action (admin-gated, re-checked in-action like
`decideCluster`):

1. Upserts the `OperatorNameCorrection` row (capturing `originalName`).
2. Patches the live DB copies for the target (per the table above).
3. `revalidatePath` the affected market/operator/scorecard pages.

Result: correct name on the next page load, no deploy.

### 2. Durable applier (on reseed) — permanent

`prisma/seed.ts`, after loading the JSON and before/after `create(...)`, reads
all `OperatorNameCorrection` rows and re-applies the same patches — extending the
existing `MANUAL_CANONICAL_OVERRIDES` seed-stamp pattern already in that file.
Because the table isn't wiped, corrections re-apply on every deploy.

**Staleness:** if a future refresh changes an operator's source name such that
the stored `originalName` no longer matches what's in the JSON, seed still
applies `correctedName` but logs a staleness warning (mirrors the merge tool's
stale-skip behavior) so drift is visible.

## Admin UI

New **"Names"** tab in `src/components/admin/AdminTabs.tsx`, route
`src/app/admin/names/`:

- **Correct a name:** search an operator → the result shows the current name plus
  its context (which market, or "group across N markets"). For a grouped
  operator the admin explicitly chooses **"fix this market's name"**
  (`targetKind=pm`) vs **"fix the group name (all N markets)"**
  (`targetKind=canonical`). Type the corrected name → Save.
- **Active corrections:** a table listing each correction (target, original →
  corrected, who/when) with an **Undo** that deletes the row and restores
  `originalName` to the live DB copies.

## Known scope boundary (Phase 1)

Live patching fixes every **DB-driven** surface immediately and consistently:
scorecard body + header, market PM-list, and operator page.

It does **not** update, in Phase 1: **search autocomplete**
(`src/data/search_index.json`), **generated PDFs**, and **briefs** — those are
static artifacts the pipeline builds from the source JSON, not DB reads. They
reflect a correction only after the next full data refresh. This is an accepted
Phase-1 limitation.

## Phase 2 (fast-follow, out of scope here)

Export the `OperatorNameCorrection` table into the pipeline's existing
`nameOverrides` mechanism (an `export_name_corrections.ts` mirroring
`export_merge_decisions.ts`), so the next full refresh bakes corrections into the
source per-market JSONs and therefore into search, PDFs, and briefs. Keeps the
table as the single source of truth; adds a third (pipeline) applier.

## Testing

- Unit: the patch resolver — given a correction + a PM/canonical fixture,
  asserts the right columns/blob fields change and slugs/ids do not; DBA-alias
  edge case; Undo restores `originalName`.
- Unit: seed re-apply — a correction row + seeded JSON produces corrected
  `PM.name` / blob / `canonicalName` after the seed step.
- The existing `node:test` suite (`npm run test:watch-list`) is the CI gate;
  new tests live alongside it under `src/lib/**`.

## Rollout

Additive: one new table (migration), one new admin route/tab, one server action,
a seed.ts extension. No change to public surfaces or existing admin tools. The
migration runs via `prisma migrate deploy` in `vercel-build`.
