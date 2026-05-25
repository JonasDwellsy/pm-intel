# v0.6.4 data pipeline

The single source of truth for the v0.6.4 per-market scorecard pipeline.
Replaces the prior pattern of one `_v064_<market>.py` script per market
(Birmingham, Huntsville, Montgomery, Seattle, Denver had grown to 5 forks
of the same 1640-line file).

## Files

| File | Purpose |
|---|---|
| `pipeline.py` | The pipeline. Self-contained, stdlib only, 1700 lines. Methodology body is byte-identical to the prior `_v064_birmingham.py`. |
| `apply_canonicals.py` | Reads a curated canonical-decisions JSON and patches per-market JSONs in place (with timestamped backups). The human-judgment step between `--propose-canonicals` and `--apply`. |
| `merge.py` | Combines per-market JSONs into `src/data/scorecard_data.json` (the app's seed). Three modes: `--dry-run` (default, safe), `--propose-canonicals` (auto-suggest cross-market collapses for review), `--apply` (snapshot + write). |
| `markets.json` | Registry of all 12 v0.6.4 markets. Per-market identity (MSA code, name, CSV file, snapshot date) lives here. |
| `canonical_decisions_v064_p2.json` | Curated canonical-operator decisions for the v0.6.4 Patch 2 release (Seattle + Denver added). Source-of-truth for which operators are cross-market entities. Update + bump filename for future releases. |
| `README.md` | This file. The add-a-market and refresh recipes. |

## Inputs (not committed)

The pipeline reads raw Dwellsy CSV exports and an operator national-lookup
JSON. These live outside the repo because they're large (single CSVs run
2–3 GB) and contain unredacted listing-level data. Default location is:

```
~/Documents/Claude/Projects/Product Support/
```

Override with `--data-dir <path>` or the `IQ_DATA_DIR` environment variable.

Required files in the data directory:
- The raw CSV(s) referenced by `markets.json` entries' `csvFile`.
- `Operator_National_Urus_v0.6.2.json` (the cross-market operator lookup;
  configurable via `markets.json` top-level `nationalLookup`).

## Add a new market

1. **Drop the raw CSV** into the data directory. One CSV can contain
   multiple MSAs (e.g., `Seattle and Denver.csv` covers two markets;
   `Al Markets.csv` covers Birmingham + Huntsville + Montgomery). The
   pipeline filters by `msa_code`.

2. **Find the MSA code** (5-digit CBSA code). The fastest way is to scan
   the CSV:

   ```bash
   python3 -c "
   import csv
   from collections import Counter
   c = Counter()
   with open('/path/to/file.csv', newline='') as f:
       for row in csv.DictReader(f):
           c[(row['msa_code'], row['msa_name'])] += 1
   for k, n in c.most_common(): print(n, k)
   "
   ```

3. **Add a market entry** to `markets.json`:

   ```json
   {
     "id":           "denver-co",                          // marketId used throughout the app
     "outputSlug":   "denver",                              // filename slug (Scorecard_Data_v0.6.4_<outputSlug>.json)
     "msaCode":      "19740",
     "msaFullName":  "Denver-Aurora-Broomfield, CO MSA",
     "name":         "Denver",                              // display name
     "state":        "CO",
     "primaryCity":  "Denver",                              // fallback if pm has no top_cities
     "csvFile":      "Seattle and Denver.csv",
     "dataAsOf":     "2026-05-24"                           // snapshot date — drives T12/T24 windows
   }
   ```

   Conventions:
   - `id` = `<city-or-region>-<state>`, lowercase, hyphen-separated. Multi-region
     MSAs use the full Census-style id (e.g., `nashville-davidson-murfreesboro-franklin-tn`).
   - `outputSlug` = short bare-city slug, used only for filenames.
   - `dataAsOf` = ISO date string; `NOW` in the pipeline is set to midnight UTC
     of this date. T12 = `NOW - 365d`, T24 = `NOW - 730d`. This is what makes
     a run reproducible.

4. **Run the pipeline:**

   ```bash
   cd scripts/data-pipeline
   python3 pipeline.py --market denver-co
   ```

   Produces two files in the data directory:
   - `Scorecard_Data_v0.6.4_<outputSlug>.json` — the per-market scorecard
   - `Scorecard_Data_v0.6.4_<outputSlug>_Summary.md` — human-readable summary

   A run for a ~500K-listing market completes in ~30s on a 2024 MacBook Pro.

5. **Sanity check the Summary.md** before merging. Things to scan:
   - `Operator dignity validation failures: 0` (anything else is a hard bug)
   - Ranked operator count (single digits would be suspicious)
   - 7-cell distribution (sum should match ranked operator count)
   - Top 5 operators (eyeball-check names against the market — anomalies
     are usually a CSV parsing issue or an MSA-code mismatch)

6. **Dry-run the merge.** Combine all per-market JSONs (including the new
   one) into the seed shape and print a structural diff against the current
   `src/data/scorecard_data.json`. Doesn't write anything.

   ```bash
   python3 merge.py
   ```

   Expected output: market list grows by 1, total PMs grows by N, canonical
   operators usually unchanged unless the new market shares operators with
   existing ones (covered next).

7. **Propose canonical-mapping extensions.** Look for new-market operators
   that should be canonicalized (cross-market entities already canonicalized
   elsewhere, e.g. Invitation Homes in Seattle joining the existing
   `invitation-homes` canonical). Writes a proposal JSON for you to review;
   doesn't write to scorecard_data.json.

   ```bash
   python3 merge.py --propose-canonicals \
       --new-markets <market-id> \
       --out /tmp/canonical_proposal.json
   ```

   **Review the proposal by hand** — two flavors of decision land here:
   - `extend_existing`: new-market PMs that look like they match an existing
     canonical entity by normalized name. Usually high-confidence for big
     institutionals (Invitation Homes, Tricon, UDR). Verify each match isn't
     a same-name-different-operator false positive.
   - `new_pairs`: pairs of single-market PMs across different markets that
     share a normalized name and look like they should become a new
     canonical entity. Lower confidence — generic names like "Real Estate
     Group" or "Property Management LLC" hit lots of false positives here.

8. **Curate the decisions JSON.** Copy `canonical_decisions_v064_p2.json`
   to a new file (e.g., `canonical_decisions_v064_p3.json` for the next
   release), keep the accepted decisions, add new ones from the proposal.
   Each entry has `canonical_slug`, `canonical_name` (used as the
   user-facing display name — supports DBA overrides), `pm_slugs` (list
   of PM slugs to fold in), and an optional `notes` / `aliases` for
   documentation. Rejected proposals can also be recorded for audit
   trail.

9. **Apply the canonical decisions.** Patches the affected per-market
   JSONs in place (with timestamped backups).

   ```bash
   python3 apply_canonicals.py --decisions canonical_decisions_v064_p3.json --apply
   ```

10. **Apply the merge.** Snapshots the existing scorecard_data.json to
    `.bak.<timestamp>`, then writes the merged JSON in place.

    ```bash
    python3 merge.py --apply
    ```

11. **Run the seed locally** to confirm it loads cleanly:

    ```bash
    FORCE_SEED=true npx prisma db seed
    ```

12. **Eyeball the new market** on `npm run dev` — visit
    `/property-managers/<state>/<city>` and a couple of operator pages.
    Spot-check before pushing.

13. **Commit + push.** Vercel re-runs the seed on deploy. The Preview
    deployment renders against the new seed — eyeball the new-market pages
    there before merging the PR to production.

## Refresh an existing market (new data)

1. Drop the new CSV in the data directory (replace or version-suffix).
2. Update `dataAsOf` (and `csvFile` if filename changed) in `markets.json`.
3. `python3 pipeline.py --market <id>` — output overwrites the old per-market JSON.
4. `python3 merge.py` (dry-run) to see what changed.
5. `python3 merge.py --apply` to write the new seed.
6. `FORCE_SEED=true npx prisma db seed` locally.
7. Commit + push. The PR shows the seed diff for review.

## Refresh ALL markets

```bash
python3 -c "
import json, subprocess
cfg = json.load(open('markets.json'))
for m in cfg['markets']:
    print(f'\\n=== {m[\"id\"]} ===')
    subprocess.run(['python3', 'pipeline.py', '--market', m['id']], check=True)
"
```

## Merge mechanics (`merge.py`)

What the merge does:
1. Combines `markets[]` from each per-market JSON.
2. Combines `pms[]` from each per-market JSON (intra-market slug
   collisions pass through verbatim — `prisma/seed.ts` has a
   deterministic disambiguator that appends `-2`/`-3` at write time).
3. Adds a top-level `marketCount` (= `len(markets)`).
4. Promotes `dataAsOf` to the top level (uses the latest per-market value).
5. Recomputes the top-level `canonicalOperators` aggregate by grouping PMs
   on their `canonicalOperatorId`. Groups spanning 2+ distinct markets
   become canonical entities with `marketIds[]`, `pmSlugs[]`, and aggregate
   stats. Single-market groups stay as per-market PMs (no top-level entry).
6. Writes the merged JSON to `src/data/scorecard_data.json` (only with
   `--apply` — `--dry-run` writes to `/tmp` for inspection).

**Canonical-operator collapse** is controlled by the per-market PM
`canonicalOperatorId` values. To collapse a new-market operator into an
existing canonical entity, edit the per-market JSON's `canonicalOperatorId`
field to match the canonical slug (or edit the upstream canonical-mapping
JSON and regenerate the per-market output). `merge.py` doesn't auto-collapse —
that decision is too dangerous to automate (same-name-different-operator
false positives ruin operator-directory UX). Use `--propose-canonicals` to
get a candidate list, then curate by hand.

**Safety guards built into `merge.py`:**
- Defaults to `--dry-run` if no mode flag is passed (no accidental writes).
- `--apply` always snapshots the existing scorecard_data.json to
  `scorecard_data.json.<timestamp>.bak` before overwriting. Backups are
  `.gitignore`d.
- Refuses to `--apply` if validation errors are present (missing required
  keys, market-count mismatch, PMs referencing unknown markets).
- Surfaces intra-market slug collisions as info messages — seed.ts handles
  them but you should know the count.

## Reproducibility quirks

**Rank ordering is sort-tie-sensitive.** PMs with identical composite scores
can swap positions between two runs of the same pipeline on the same data
(Python's set/dict iteration order isn't deterministic across processes
without `PYTHONHASHSEED=0`). The metric values themselves are reproducible —
only `rank.overall` and `rank.quadrant` can shift by ±1 for sort-tied PMs.

If byte-identical reproducibility ever matters (e.g., for CI assertions),
set:

```bash
PYTHONHASHSEED=0 python3 pipeline.py --market <id>
```

Or add a deterministic secondary sort key (`slug`) inside the pipeline.

**Methodology constants are NOT in `markets.json`.** The eligibility
thresholds (`ELIG_T12_MIN=30`, `ELIG_ADDR_MIN=3`, `ELIG_BIG_COMM_MIN=30`)
and the institutional cutoff (`INSTITUTIONAL_THRESHOLD=500`) live in
`pipeline.py`. Changing them is a methodology version bump and warrants
a code review — they define the v0.6.4 methodology itself, not per-market
identity. If you need to experiment with different thresholds, ship a
methodology patch (v0.6.5, etc.) rather than diverging the registry.

## Audit trail

Pre-existing per-market scripts (`_v064_birmingham.py`, `_v064_huntsville.py`,
`_v064_montgomery.py`, `_v064_seattle.py`, `_v064_denver.py`) remain in the
data directory for historical reference. They are superseded by
`pipeline.py` and should not be used for new market builds — any
methodology change made to one fork drifts the others.
