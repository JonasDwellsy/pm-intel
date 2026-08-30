# Methodology re-run: what it involves

A **methodology release on existing data** — the pipeline is re-run to apply
changed scoring, but no new export is merged and `dataAsOf` does not move. That
distinction drives most of what follows.

Companion to `scripts/data-pipeline/MONTHLY_REFRESH.md`, which owns the normal
monthly flow and the production release boundary. This covers only what is
different about a methodology re-run.

Written for, and verified against, the v0.7 → v0.8 release of August 2026. The
measured numbers throughout are from that run.

## The v0.8 release

| PR | change | effect |
|---|---|---|
| #422 | stated rules a first-class composite component | every operator's composite reweighted |
| #426 | marketing star scored on an absolute bar | gold at 80, silver at 70, no cohort |
| #427 | retires #420's national marketing cohort | see below |

#420 had scored the marketing star's *fallback* cohort against a national
7-cell distribution, to stop institutional operators earning gold at twice the
independent rate. #426 makes that machinery unnecessary: an absolute bar has no
cohort to be unfair about. #427 removes it, which is what collapses this
runbook from two passes to one.

## The part that used to be easy to get wrong

**It no longer takes two passes.** Older copies of this runbook required them.

The second pass existed only because `marketing_national_cohorts.json` was
generated *from* the merged seed while `pipeline.py` *read* it to score the
marketing fallback — a circular dependency, so any change to the composite
formula left the committed file holding old-formula scores. With #420 retired
the file is gone and the cycle with it. One pass is now correct, not merely
approximately correct.

If you are looking at a branch that still contains
`build_marketing_cohorts.py`, you are before #427 and the two-pass rule still
applies to it.

## The part that is easy to miss

**Snapshots will not update, because `dataAsOf` has not changed.**

`prisma/seed.ts` writes snapshots with `createMany({ skipDuplicates: true })`
against `@@unique([pmSlug, snapshotDate])`. On a re-run with unchanged
`dataAsOf`, every snapshot row for that date already exists and is **skipped**.
The `PM` table gets the new stars; `OperatorSnapshot` keeps the old ones.

Consequences:

- Snapshots silently disagree with the scorecards until the next real refresh.
- Anything reading snapshots rather than `PM` — the watch-list changes page,
  market-brief change blocks — shows stale stars.
- The digest is protected, but only by accident: the stale rows keep the old
  `methodologyVersion`, so the next refresh's rows trip the
  `methodologyChanged` guard and the whole diff is suppressed.

**Therefore the snapshot rows at the current `dataAsOf` must be deleted before
the seed, so the seed rewrites them.** `scripts/maintenance/refresh-current-snapshots.ts`
does exactly this and nothing else — see step 8.

## Version bump

A methodology re-run changes stars, so `methodologyVersion` moves in
`markets.json`, and `METHODOLOGY_VERSION` in `src/lib/version.ts` must move
with it — `version.test.ts` fails CI if they disagree.

One consequence to time deliberately: `diffSnapshots` suppresses **every**
change type when the methodology version differs between two snapshots. The
first digest after this release reports nothing at all. That is correct
behaviour — it prevents a recalibration wave being reported as thousands of
real operator changes — but it means one month's genuine changes go unreported.
Best paired with a month where that is acceptable.

## Prerequisites

- All 44 source CSVs present. Verified 2026-08-21: **44/44, 19.1 GB**.
- `IQ_DATA_DIR` pointed at the Shared Drive mount (see MONTHLY_REFRESH.md), or
  the local fallback if that is genuinely the source of truth for this run.
- `PYTHONHASHSEED=0` on every pipeline invocation, for reproducible ranks.

## Sequence

All pipeline commands from `scripts/data-pipeline/`.

Steps 1–3 are one pass, and step 2 is the one that gets skipped. It was skipped
on the first attempt at this re-run, which is why it is called out this loudly.

**1. Run every market.** Exceeds any 10-minute foreground limit; run it in the
background and watch the log.

```bash
for M in $(python3 -c "import json;print(' '.join(m['id'] for m in json.load(open('markets.json'))['markets']))"); do
  PYTHONHASHSEED=0 python3 pipeline.py --market "$M" --data-dir "$IQ_DATA_DIR"
done
```

Gate: every market ends `Operator dignity validation failures: 0`.

**2. Re-apply the curated canonical decisions.** *Do not skip this.*

`pipeline.py` regenerates each per-market JSON from raw CSV, which **overwrites
the curated cross-market operator groupings** `apply_canonicals.py` patches in.
Skipping it silently destroys them. Measured on this exact re-run: the merge
diff read `Canonical operators: 188 → 116 (+7 / -79 / ~2)` — 79 groupings gone —
and after re-applying, `188 → 188 (+0 / -0 / ~0)`.

```bash
ORDER="canonical_decisions_v064_p1_base.json"
for n in 2 3 4 5 6 7 8 9 10 11 12 13; do ORDER="$ORDER canonical_decisions_v064_p${n}.json"; done
for f in $ORDER; do python3 apply_canonicals.py --decisions "$f" --apply; done
```

Order matters: a plain `ls` sorts `p10`–`p13` before `p2`, applying later
curation before earlier. Sort numerically. Each file reporting skipped slugs
"not in current data" is normal — those are decisions about operators that have
since merged, renamed or dropped out.

**3. Merge.**

```bash
python3 merge.py                # dry run, prints the structural diff
python3 merge.py --apply
```

Gate: `Canonical operators: N → N (+0 / -0 / ~0)`. **Any negative number means
step 2 was missed or incomplete — stop and re-apply rather than merging.**

**4. Rebuild the search index.**

```bash
npx tsx scripts/build-operator-universe.ts
```

Gate: **Tier 2 stays ~12,951.** If it prints 0, the builder could not find its
source JSONs — that is the silent failure mode, and it does not error.

**5. Bump the version.** `markets.json` `methodologyVersion`, and
`METHODOLOGY_VERSION` in `src/lib/version.ts` to match.

**6. Update the methodology page** for whatever changed.

**7. Open the data-release PR.** Full gate: `tsc`, `npm run lint`,
`npm run test:watch-list`, `npm run test:components`, the pipeline suites
(`python3 -m unittest test_marketing test_merge test_operator_grouping
test_property_detail test_property_homes test_tenancy_survival
test_classify_management_website`).

**8. Production release** — follow the controlled procedure in
MONTHLY_REFRESH.md (restore point, no concurrent operations). Two steps, in
this order:

```bash
npx tsx scripts/maintenance/refresh-current-snapshots.ts           # dry run
APPLY=1 npx tsx scripts/maintenance/refresh-current-snapshots.ts   # deletes
FORCE_SEED=true npm run db:seed:production                         # rewrites
```

The delete must precede the seed — reversed, the seed skips the existing rows
and the delete then leaves a hole with no snapshots at all for that date. The
script reads its target date from the seed rather than taking an argument, so
the two cannot disagree; it refuses to act if the rows already carry the seed's
methodology version, and it never touches an older date.

## Acceptance: this is not a 0-drift release

The monthly refresh gates on *zero* drift for existing markets. **This release
is the opposite** — stars are supposed to move. The gate is that the changes
are the intended ones and nothing else moved:

- `marketing` blocks change; `performance`, `tenancy`, `rentPerformance`,
  `communityVisibility` do **not**
- `compositeScore` changes only from the reweighting, not from cohort changes —
  a cohort change moves the *star*, never the score
- every marketing star agrees with the absolute bar: gold iff score ≥ 80,
  silver iff 70 ≤ score < 80
- market count stays 44, PM count stays ~4,468 — a big move means something
  else broke

Measured on the shipped v0.8 seed (44 markets, 4,468 operators, 188 canonicals):

```
marketing            4,468 changed   <- expected, every operator gains policiesScore
performance              0 changed
tenancy                  0 changed
rentPerformance          0 changed
communityVisibility      0 changed

marketing gold             767 (19.1%)
marketing silver           929 (23.1%)
threshold violations         0
```

Zero movement in the other four metric blocks is the load-bearing check — it is
what proves the change is scoped to marketing.

## Estimated cost

~15–20 minutes over 19.1 GB (Dallas, 1.7 GB / 222 PMs, measured at 78s), so
**roughly 25–30 minutes** end to end including the merge and the index rebuild.
Then the production release, which is its own controlled operation.

Before #427 this was two passes and 45–60 minutes.

## Rollback

`merge.py --apply` snapshots the previous seed to `src/data/.backups/`
(3 kept). Reverting the code PRs and restoring the newest backup returns the
committed data. Production rolls back via the restore point taken before the
seed, per MONTHLY_REFRESH.md — a redeploy is **not** a rollback, since
deployments no longer seed.
