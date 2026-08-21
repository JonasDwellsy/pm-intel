# Monthly data refresh — runbook

The change-over-time surfaces (market-brief "since last period" block, the
national brief, watch-list change alerts, operator trajectory sparklines, and
both email digests) are all driven by **`OperatorSnapshot` rows keyed by
`snapshotDate`**, and `snapshotDate == the seed's `dataAsOf`. A new comparison
period only exists when **`dataAsOf` advances** — i.e. when a fresh month of
listing data is ingested. Re-seeding with the same `dataAsOf` writes no new
snapshots (idempotent on `[pmSlug, snapshotDate]`).

So "monthly briefs / change over time" is not a code feature to build — the
code is done. It requires running this refresh **once a month** so each month
lands its own snapshot. Do that and the change blocks + digests light up
automatically.

## Cadence & the `dataAsOf` convention

- **Run monthly**, when the new export lands.
- `dataAsOf` is the **true last listing-event date** in the data (max of
  `creation_time` / `deactivation_time`), NOT the upload date.
  `merge_listings.py --apply` derives it from the export and patches
  `markets.json` for you — do not hand-set it.
- One refresh = one new `snapshotDate` for every market = one new period in
  every change block and digest.

## Data source & `IQ_DATA_DIR`

The canonical source data lives in the company Google Shared Drive:
**Shared drives → Dwellsy Enterprise → Products → Operator IQ → Data Files**
(34 `merged_<market>_<date>.csv` + `markets.json` + `CHECKSUMS.sha256` +
`MIGRATION_MANIFEST.md`). New monthly exports go here.

The pipeline reads a local filesystem path, so mount that folder with **Google
Drive for Desktop** and point `IQ_DATA_DIR` at the mount (tip: mark the folder
"Available offline" first so a run doesn't stall streaming ~15 GB on demand):

```
export IQ_DATA_DIR="$HOME/Library/CloudStorage/GoogleDrive-<you>@dwellsy.com/Shared drives/Dwellsy Enterprise/Products/Operator IQ/Data Files"
```

(The pipeline scripts still fall back to `~/Documents/Claude/Projects/Product
Support` when `IQ_DATA_DIR` is unset — the old laptop location — but the Shared
Drive is now the source of truth; set `IQ_DATA_DIR` so runs read from it.)

## Steps

Run everything with `PYTHONHASHSEED=0` for reproducible ranks. All commands
from `scripts/data-pipeline/`.

1. **Get the new monthly export(s)** — one or more `export_*.csv` from the data
   team.

2. **Merge listings + advance `dataAsOf`:**
   ```
   python3 merge_listings.py --new export_<yyyymmdd>.csv --apply
   ```
   Dedups by `listing_id` (newest wins) into `merged_<market>_<asof>.csv` and
   patches each affected market's `csvFile` + `dataAsOf` in `markets.json`.
   Confirm `dataAsOf` advanced (`git diff markets.json`). Preview without
   `--apply` first if unsure.

3. **Run the pipeline for every market** (35):
   ```
   for M in $(python3 -c "import json;print(' '.join(m['id'] for m in json.load(open('markets.json'))['markets']))"); do
     PYTHONHASHSEED=0 python3 pipeline.py --market "$M" --data-dir "$IQ_DATA_DIR"
   done
   ```
   Check the tail of each run: `Operator dignity validation failures: 0`.
   This also emits the per-home extract `property_homes_<market>.jsonl` into
   `$IQ_DATA_DIR` — load it into Neon per **"Individual-home extract →
   `PropertyHome`"** below (independent of the seed flow; do it any time after
   this step).

4. **Apply cross-market canonicals** (all curated sets, sequentially). Apply
   **every** `canonical_decisions_v064_p*.json` that exists — new markets add new
   sets (e.g. p9 = Milwaukee), and omitting one drops that market's cross-market
   canonicals. Derive the list from the files rather than hard-coding it:
   ```
   for f in $(ls canonical_decisions_v064_p*.json | sed -E 's/canonical_decisions_v064_(p[^.]*)\.json/\1/'); do
     PYTHONHASHSEED=0 python3 apply_canonicals.py --decisions "canonical_decisions_v064_$f.json" --apply
   done
   ```
   (As of 2026-07-19 that is p1_base p2 p3 p4 p5 p6 p7 p8 p9. Note the `version`
   label *inside* some files is off — e.g. p7's file says `-p10`, p8's `-p11-LA`
   — but the filename order p1_base→p9 is what governs.)

5. **Normalize operator names:** `PYTHONHASHSEED=0 python3 normalize_pm_names.py --apply`

6. **Re-export curated merges — BEFORE `merge.py`.** `export_merge_decisions.ts`
   resolves member slugs against the *current committed* seed, so it must run
   against the PRE-merge seed. Run it after `merge.py --apply` and the
   collapsed members' slugs are gone → mass "unresolvable slug" skips.
   ```
   PYTHONHASHSEED=0 npx tsx scripts/data-pipeline/export_merge_decisions.ts
   ```

7. **Merge to the seed:** `PYTHONHASHSEED=0 python3 merge.py` (dry-run — review
   the market/PM/canonical diff), then `python3 merge.py --apply`.

8. **Rebuild the operator universe:**
   `PYTHONHASHSEED=0 npx tsx scripts/build-operator-universe.ts`
   Reads each market's per-market source JSON from `$IQ_DATA_DIR` (same as the
   pipeline) to build the tracked/search tier — **keep `IQ_DATA_DIR` exported**
   (step 2) or the tracked tier silently empties to 0 and search loses every
   sub-ranked operator. Also: this script's `MARKETS` array is hand-maintained
   — **add each new market to it** (id + slugs), or the market's ranked +
   tracked operators won't appear in search even though the seed has them.

9. **Verify the seed** (`src/data/scorecard_data.json`): `marketCount` 34,
   `methodologyVersion` v0.7 / `designVersion` v2.0 unchanged, and **`dataAsOf`
   advanced to the new cutoff**.

10. **Commit + open the data-release PR.** Review the generated data diff and
    wait for CI plus the Vercel preview. `vercel-build` only compiles the app;
    it does not migrate or seed a database.

11. **Apply the approved production data release** using the controlled
    procedure below. This is the step that runs the seed and writes the new
    month's operator snapshots.

12. **Confirm the change surfaces populated:** once ≥2 monthly snapshots exist,
    a market brief's "since last period" block and the national brief show real
    month-over-month movement, and the digests have deltas to send.

## Digest cadence and the snapshot-diff window

Both digest crons are ENABLED: the watch-list change digest at 13:00 UTC daily
and the market-brief digest at 14:00 UTC.

```json
{
  "crons": [
    { "path": "/api/cron/watch-list-digest", "schedule": "0 13 * * *" },
    { "path": "/api/cron/brief-digest", "schedule": "0 14 * * *" }
  ]
}
```

They were paused on 2026-08-20 and re-enabled the same day. The reason is worth
keeping, because it will recur on any seed that lands well after the previous
one: the diff a digest reports is against the LAST SNAPSHOT, not against what
changed this month. Snapshot `2026-08-20` was the first since `2026-08-07`, and
deployments stopped seeding on 2026-08-19, so it absorbed every seed change
made in between — 35 operators with changed `topMSAs` (real cross-market
footprint additions) and nothing else. Those reported as "Entered a new market"
for the current period even though they accrued earlier. That was accepted
deliberately rather than suppressed.

**Two controls worth knowing before a data release:**

- `WatchListDigestRun` holds one row per `snapshotDate`, so a firing is
  deferred by pausing, never lost. Re-enabling picks the snapshot back up.
- Recipients are gated by `DigestPreference.cadence` (monthly = a 28-day floor
  from `lastDigestAt`), so a run can legitimately report
  `recipientCount: 0` — that is the cadence working, not a failure. Check
  `lastDigestAt` per subscriber before assuming the send path is broken.

To preview without sending, hit either route with `?dryRun=1` (composes and
counts, records nothing).

## Production release boundary

Vercel deployments are build-only. They run `prisma generate` and `next build`
but never migrate, seed, or export data. This keeps code-only deployments from
writing to production and makes the shipped artifact reproducible.

### Schema release

Only an authorized operator may apply a migration. Before merging code that
depends on a new schema, confirm the migration is backward-compatible with the
currently deployed application, confirm the shell's existing `DATABASE_URL`
and `DATABASE_URL_UNPOOLED` target the intended Operator IQ production database
without printing either value, and run this from the repository root:

```bash
npm run db:migrate:production
```

Confirm Prisma reports no pending migrations, then merge and verify the normal
production deployment. A migration that is not backward-compatible needs a
staged expand-and-contract release and must not use this one-step procedure.

### Monthly data release

The seed prepares replacement rows in memory and commits its deletes, batched
inserts, snapshot capture, count checks, and fingerprint in one transaction over
the unpooled connection. Readers continue seeing the prior complete dataset
until the replacement commits. Treat it as a controlled production operation,
not a deployment side effect.

1. Merge the reviewed data-release PR and wait for the production deployment
   to report Ready.
2. Confirm there is no concurrent deployment or data operation. Create or
   confirm a recoverable database restore point immediately before the run.
3. In an authorized shell whose existing `DATABASE_URL` and
   `DATABASE_URL_UNPOOLED` both target Operator IQ production, run the
   command-scoped forced seed. The seed prefers the unpooled URL. Do not persist
   `FORCE_SEED` in Vercel or print either database URL.

   ```bash
   FORCE_SEED=true npm run db:seed:production
   ```

4. Compare the reported market and PM totals with the committed seed, confirm
   the content-version stamp was written, and smoke-test the homepage, one
   market, one operator, and the current monthly brief.
5. If the seed exits before completion, stop and verify the prior fingerprint,
   row counts, and spot checks remain intact. The transaction should have rolled
   back automatically. Investigate before another attempt. Only restore the pre-run recovery point
   if those checks disagree, and do not use a redeploy as recovery.

`data:export-name-corrections` remains an offline pipeline command. Run it
before `build-operator-universe.ts`, review and commit the generated JSON, and
never rely on a Vercel build's disposable filesystem to preserve its output.

## Individual-home extract → `PropertyHome` (owner-run, after the pipeline)

The pipeline run (step 3) also emits a per-home extract per market —
`property_homes_<market>.jsonl` in `$IQ_DATA_DIR`, next to each
`Scorecard_Data_*.json`. It powers the **"Homes" sheet** on the Properties
export (scattered-SFR homes; concentrated MF communities excluded). This is a
**separate Neon table** (`PropertyHome`) loaded directly by an owner-run
script — it is NOT part of the seed / merge / deploy flow above and needs no
reseed or redeploy. Load it any time after step 3.

**From the repo root** (not `scripts/data-pipeline/` like the rest):

```
# first load of a fresh table:
HOMES_DIR="$IQ_DATA_DIR" npx tsx scripts/load-property-homes.ts
# every monthly refresh after that (homes age out of the T12 window):
HOMES_DIR="$IQ_DATA_DIR" npx tsx scripts/load-property-homes.ts --reset
```

- **`HOMES_DIR` MUST point at the extracts.** If it's unset the loader
  defaults to `scripts/data-pipeline` (no extracts there) and silently loads
  nothing. Watch the first line of output — `files=35 homes=<N>`. `files=0`
  means `HOMES_DIR` didn't resolve; fix it and rerun.
- **Use `--reset` on every refresh after the first.** A plain re-run upserts
  (idempotent on `pmSlug+addressId`) but leaves stale rows for homes that fell
  out of the rolling T12 window; `--reset` deletes each loaded operator's rows
  first so the table matches exactly the current window.
- Reads ambient `DATABASE_URL` from `.env` (the shared Neon DB) via the same
  prisma singleton as the other data scripts — writes to prod. Finishes with
  `DONE. PropertyHome rows: <N>`; the total should equal the summed extract
  line counts. Baseline from the 2026-07-21 full load: **221,709 rows / 3,258
  operators / 35 markets** (sanity anchor — a big pure-MF operator like Equity
  Residential should contribute 0 homes).

## Refreshing search after operator name corrections

Admin name corrections (`/admin/names`) are live in the app immediately and
re-applied on every reseed, EXCEPT the global search index
(`src/data/search_index.json`), a committed offline artifact. To refresh it:
run `npx tsx scripts/data-pipeline/export_name_corrections.ts` (writes
`src/data/name_corrections.json` from the DB — needs `DATABASE_URL`), then
`IQ_DATA_DIR=… PYTHONHASHSEED=0 npx tsx scripts/build-operator-universe.ts`,
then commit both files + deploy. The monthly refresh already runs
build-operator-universe (step 8), so a monthly refresh also picks up
corrections (run the exporter first).

## One-time: activate the email digests

The crons are already scheduled in `vercel.json` (`watch-list-digest` 13:00 UTC,
`brief-digest` 14:00 UTC daily) and fire only when they detect a new
`snapshotDate`. They stay **inert until these env vars are set in Vercel**
(Jonas — Vercel dashboard, Production):

- `SENDGRID_API_KEY` — SendGrid API key (Dwellsy's SendGrid account)
- `DIGEST_FROM_EMAIL` — a SendGrid-verified sender / authenticated domain
- `CRON_SECRET` — shared secret the cron routes check (also set on the cron)
- `DIGEST_UNSUB_SECRET` — HMAC secret for one-click unsubscribe links
- `APP_BASE_URL` (or `NEXT_PUBLIC_APP_URL`) — absolute base for links in emails

Until then the monthly refresh still powers the *on-page* change blocks; only
the outbound email push is gated.

## Ownership

The data export is manual (the pipeline can't pull it), so the monthly trigger
is a standing calendar item, not automation. When the export lands, run steps
1–12. The authorized production data-release step handles snapshot capture;
the Vercel deployment does not write data.
