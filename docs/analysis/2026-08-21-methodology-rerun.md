# Methodology re-run: what it involves

Two merged changes need a full pipeline re-run before they reach anyone, and a
third is blocked behind it. This is a **methodology release on existing data**,
not a monthly data refresh — no new export, `dataAsOf` does not move. That
distinction drives most of what follows.

Companion to `scripts/data-pipeline/MONTHLY_REFRESH.md`, which owns the normal
monthly flow and the production release boundary. This covers only what is
different about a methodology re-run.

## What is waiting on it

| PR | change | effect |
|---|---|---|
| #420 | marketing star fallback scored nationally | ~10–15% of operators change cohort; institutional gold rate 50.3% → ~26% |
| #422 | stated rules a first-class component | composite reweighted; 65 of 279 stars moved in the two test markets |
| — | absolute marketing star | **blocked** — needs the post-re-run distribution to calibrate against |

Also resolved incidentally: the data-vintage spread (2 markets on 08-05, 40 on
08-06, 1 on 08-07, Bozeman on 08-20) collapses to one date only if a new export
is merged first. A methodology-only re-run leaves the spread as-is.

## The part that is easy to get wrong

**It takes two full passes, not one.**

`marketing_national_cohorts.json` is generated *from* the merged seed, and
`pipeline.py` *reads* it to score the marketing fallback. #422 changed the
composite formula, so the committed cohort file now holds old-formula scores. A
single pass would score fallback operators against a stale distribution.

```
pass 1:  run all 44  →  merge  →  seed now has new-formula composites
         (fallback stars in this pass are scored against the STALE file)

regenerate:  python3 build_marketing_cohorts.py

pass 2:  run all 44  →  merge  →  fallback stars now correct
```

A single pass would be *approximately* right — the composite distribution
barely moved (median 68.5 → 68.6), and only the ~10–15% on the fallback level
are affected — but "approximately right stars" is not what a methodology
release should ship.

This two-pass cost is a wart introduced by #420. The clean fix is to split star
assignment into a post-merge pass that sees all markets at once, which would
remove the precomputed file entirely. Worth doing before the next methodology
change, not during this one.

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
- The digest is protected, but only by accident: the stale rows keep
  `methodologyVersion: v0.7`, so the next refresh's v0.8 rows trip the
  `methodologyChanged` guard and the whole diff is suppressed.

**Therefore: delete the snapshot rows for the affected dates as part of the
release, so they are rewritten.** That is a destructive production operation and
belongs to the authorized operator, alongside the restore point the monthly
runbook already requires. Deleting is the right call — leaving them means
carrying a known inconsistency for a month.

## Version bump

This changes stars, so `methodologyVersion` moves **v0.7 → v0.8** in
`markets.json`, and `METHODOLOGY_VERSION` in `src/lib/version.ts` must move with
it — `version.test.ts` fails CI if they disagree.

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

All commands from `scripts/data-pipeline/`.

Each **pass** is three steps — run, re-apply canonicals, merge — and the middle
one is the easy one to skip. It was skipped on the first attempt at this
re-run, which is why it is called out this loudly.

### Pass 1

**1a. Run every market.** Exceeds any 10-minute foreground limit; run it in the
background and watch the log.

```bash
for M in $(python3 -c "import json;print(' '.join(m['id'] for m in json.load(open('markets.json'))['markets']))"); do
  PYTHONHASHSEED=0 python3 pipeline.py --market "$M" --data-dir "$IQ_DATA_DIR"
done
```

Gate: every market ends `Operator dignity validation failures: 0`.

**1b. Re-apply the curated canonical decisions.** *Do not skip this.*

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

**1c. Merge.**

```bash
python3 merge.py                # dry run, prints the structural diff
python3 merge.py --apply
```

Gate: `Canonical operators: N → N (+0 / -0 / ~0)`. **Any negative number means
1b was missed or incomplete — stop and re-apply rather than merging.**

### Between passes

**2. Regenerate the national cohort distribution** — the step that makes pass 2
necessary at all.

```bash
python3 build_marketing_cohorts.py
```

Gate: all 7 cells present and each ≥ `MIN_COHORT_N`;
`test_marketing_cohorts.py` enforces both.

### Pass 2

**3. Repeat 1a, 1b and 1c.** All three, in that order — pass 2 re-runs the
pipeline, so it overwrites the canonical patches again exactly as pass 1 did.
Marketing fallback stars are now scored against the correct distribution.

### Then

**4. Rebuild the search index.**

```bash
npx tsx scripts/build-operator-universe.ts
```

Gate: **Tier 2 stays ~12,951.** If it prints 0, the builder could not find its
source JSONs — that is the silent failure mode, and it does not error.

**5. Bump the version.** `markets.json` `methodologyVersion` → `v0.8`, and
`METHODOLOGY_VERSION` in `src/lib/version.ts` to match.

**6. Update the methodology page** for the marketing changes — the rules
component and, if it ships in the same release, the absolute star.

**7. Open the data-release PR.** Full gate: `tsc`, node tests, component tests,
the five pipeline suites.

**8. Production release** — follow the controlled procedure in
MONTHLY_REFRESH.md (restore point, no concurrent operations,
`FORCE_SEED=true npm run db:seed:production`). Add the snapshot deletion from
the section above.

## Acceptance: this is not a 0-drift release

The monthly refresh gates on *zero* drift for existing markets. **This release
is the opposite** — stars are supposed to move. The gate is that the changes
are the intended ones and nothing else moved:

- `marketing` blocks change; `performance`, `tenancy`, `rentPerformance`,
  `communityVisibility` do **not**
- `compositeScore` changes only from the #422 reweighting, not from cohort
  changes — a cohort change moves the *star*, never the score
- marketing cohort names read `National <7-cell>` only for operators on the
  fallback level
- market count stays 44, PM count stays ~4,468 — a big move means something
  else broke

Measured on the real pass-1 run across all 44 markets (4,468 operators):

```
marketing            4,468 changed   <- expected, every operator gains policiesScore
performance              0 changed
tenancy                  0 changed
rentPerformance          0 changed
communityVisibility      0 changed

marketing stars moved    1,008 (22.6%), both directions
cohort level changes     510 msa -> fallback
on a National cohort     795
```

Zero movement in the other four metric blocks is the load-bearing check — it is
what proves the change is scoped to marketing.

## Estimated cost

~15–20 minutes per pass over 19.1 GB (Dallas, 1.7 GB / 222 PMs, measured at
78s), so **roughly 45–60 minutes** end to end including both merges and the
index rebuild. Then the production release, which is its own controlled
operation.

## Rollback

`merge.py --apply` snapshots the previous seed to `src/data/.backups/`
(3 kept). Reverting the code PRs and restoring the newest backup returns the
committed data. Production rolls back via the restore point taken before the
seed, per MONTHLY_REFRESH.md — a redeploy is **not** a rollback, since
deployments no longer seed.
