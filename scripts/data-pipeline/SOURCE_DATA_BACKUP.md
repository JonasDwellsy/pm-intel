# Pipeline source-data backup runbook

The raw + merged pipeline source data (~27 GB) currently lives **only** on
Jonas's laptop at `~/Documents/Claude/Projects/Product Support`. The live app
does **not** depend on it (Vercel builds + seeds from committed JSON in the
repo), but it is the irreplaceable input for every data refresh, and losing it
would mean we could no longer refresh or expand the dataset. This runbook backs
it up to a **company-owned, access-controlled Google Shared Drive** and keeps
that copy current after each refresh.

## What we back up

The **whole** `Product Support/` directory, excluding `__pycache__/`. Two tiers
live in there (both worth keeping):

- **Tier 1 — the 34 `merged_*_<date>.csv` files (~15.4 GB).** The actual
  pipeline inputs, one per market in `markets.json`. **Must-keep** — losing
  these breaks refresh/rebuild.
- **Tier 2 — the raw Dwellsy exports (~12 GB)** (descriptive-name CSVs +
  `export_*.csv`). Point-in-time snapshots of Dwellsy listings that were merged
  into Tier 1. Not needed for normal ops, but you can't re-export past dates, so
  they're an irreplaceable source/audit trail.

## Tool: rclone

Installed (`brew install rclone`, v1.74+). rclone is resumable + verifies with
MD5 checksums (Google Drive exposes MD5), which is why we use it over the Drive
desktop app for multi-GB files.

## One-time setup

### 1. Create the Shared Drive (Google Workspace)
In Google Drive → **Shared drives** → **New**, create e.g. **`Dwellsy IQ —
Pipeline Source`**. Add the Dwellsy team as members. A Shared Drive is owned by
the Workspace org (not a personal account), so the data leaves the laptop into
company-controlled, access-controlled storage.

### 2. Configure the rclone remote (interactive — needs your Google login)
```bash
rclone config
```
- `n` (new remote) → name it **`gdrive-pipeline`**
- Storage type: **`drive`** (Google Drive)
- `client_id` / `client_secret`: leave blank (uses rclone's default; fine for this)
- `scope`: **`1`** (full `drive` access)
- Accept defaults until: **"Use auto config?"** → `y` → a browser opens → sign in
  as your Dwellsy Google account and approve.
- **"Configure this as a Shared Drive (Team Drive)?"** → **`y`** → pick
  **`Dwellsy IQ — Pipeline Source`**.
- Confirm + quit.

Verify it's wired to the Shared Drive:
```bash
rclone lsd gdrive-pipeline:
```

## First backup

```bash
SRC="$HOME/Documents/Claude/Projects/Product Support"
rclone copy "$SRC" "gdrive-pipeline:Product Support" \
  --exclude "__pycache__/**" \
  --drive-chunk-size 256M \
  --transfers 4 --checkers 8 \
  --progress
```
`copy` (not `sync`) for the first push — it never deletes on the remote.
`--drive-chunk-size 256M` makes the multi-GB files upload fast (default 8M is
slow). 27 GB is well under Google's 750 GB/day upload cap.

## Verify integrity (do this after every upload)

```bash
SRC="$HOME/Documents/Claude/Projects/Product Support"
rclone check "$SRC" "gdrive-pipeline:Product Support" \
  --exclude "__pycache__/**" --one-way
```
`--one-way` = every local file must exist + match (by MD5) on the remote.
Expect `0 differences found`. This is the proof the backup is intact.

## Ongoing — after each data refresh

Once the first backup + verify pass, keep the mirror current by running this
whenever the monthly refresh (see `MONTHLY_REFRESH.md`) adds/updates source
files:
```bash
SRC="$HOME/Documents/Claude/Projects/Product Support"
rclone sync "$SRC" "gdrive-pipeline:Product Support" \
  --exclude "__pycache__/**" --drive-chunk-size 256M --progress
rclone check "$SRC" "gdrive-pipeline:Product Support" \
  --exclude "__pycache__/**" --one-way
```
`sync` mirrors (removes remote files you deleted locally) — the right choice for
keeping the copy in lockstep once the initial `copy` has run.

> Add this as the final step of `MONTHLY_REFRESH.md` so the backup never drifts.

## Phase 2 (later, optional) — make refreshes laptop-independent

Once backed up, the pipeline can read its inputs from the cloud instead of the
laptop: sync the Shared Drive down (or mount it) on any machine and point
`IQ_DATA_DIR` at it, so a teammate can run a refresh without your laptop. Object
storage (S3/R2) is a better fit than Drive for that mounted-source use; revisit
when Phase 2 is prioritized.
