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

3. **Run the pipeline for every market** (34):
   ```
   for M in $(python3 -c "import json;print(' '.join(m['id'] for m in json.load(open('markets.json'))['markets']))"); do
     PYTHONHASHSEED=0 python3 pipeline.py --market "$M" --data-dir "$IQ_DATA_DIR"
   done
   ```
   Check the tail of each run: `Operator dignity validation failures: 0`.

4. **Apply cross-market canonicals** (8 curated sets, sequentially):
   ```
   for f in p1_base p2 p3 p4 p5 p6 p7 p8; do
     PYTHONHASHSEED=0 python3 apply_canonicals.py --decisions "canonical_decisions_v064_$f.json" --apply
   done
   ```

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

9. **Verify the seed** (`src/data/scorecard_data.json`): `marketCount` 34,
   `methodologyVersion` v0.7 / `designVersion` v2.0 unchanged, and **`dataAsOf`
   advanced to the new cutoff**.

10. **Commit + open the deploy PR.** On merge, `vercel-build` re-seeds
    (`SEED_CONTENT_VERSION` changed) and `captureOperatorSnapshots` writes the
    new month's snapshot. Do NOT run `prisma db seed` locally.

11. **Confirm the change surfaces populated:** once ≥2 monthly snapshots exist,
    a market brief's "since last period" block and the national brief show real
    month-over-month movement, and the digests have deltas to send.

## One-time: activate the email digests

The crons are already scheduled in `vercel.json` (`watch-list-digest` 13:00 UTC,
`brief-digest` 14:00 UTC daily) and fire only when they detect a new
`snapshotDate`. They stay **inert until these env vars are set in Vercel**
(Jonas — Vercel dashboard, Production):

- `RESEND_API_KEY` — Resend API key
- `DIGEST_FROM_EMAIL` — a Resend-verified sender address
- `CRON_SECRET` — shared secret the cron routes check (also set on the cron)
- `DIGEST_UNSUB_SECRET` — HMAC secret for one-click unsubscribe links
- `APP_BASE_URL` (or `NEXT_PUBLIC_APP_URL`) — absolute base for links in emails

Until then the monthly refresh still powers the *on-page* change blocks; only
the outbound email push is gated.

## Ownership

The data export is manual (the pipeline can't pull it), so the monthly trigger
is a standing calendar item, not automation. When the export lands, run steps
1–10; the deploy handles the snapshot capture.
