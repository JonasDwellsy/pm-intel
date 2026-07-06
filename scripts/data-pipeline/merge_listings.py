#!/usr/bin/env python3
"""Monthly listing-level data merge.

Folds a fresh (scoped) Dwellsy export into each tracked market's existing
per-market CSV so the analysis picks up newly-closed listings (final asking
rent), price/status changes on still-open listings, and brand-new inventory —
WITHOUT re-downloading five years of history.

WHY A MERGE (not a re-download)
-------------------------------
Every listing row carries a stable `listing_id` plus `creation_time` /
`deactivation_time` (open→close) and `rent_amount`. The existing per-market
CSVs are one-row-per-listing full-history snapshots. A fresh export re-reports
the recent tail: listings that were open now show a `deactivation_time` (and
final rent), some open listings changed price, and there's new inventory. So
the correct update is a UNION keyed by `listing_id`, keeping the newest record
on collision — which reproduces the same end-state a full re-download would,
for the trailing-window analysis, at a fraction of the effort. (Listings that
closed long ago are immutable and sit outside the T12/T24 windows, so not
re-reading them costs nothing analytically.)

The pipeline filters rows by `msa_code` and assumes one row per listing (no
internal dedup), so this tool emits one deduped row per listing per MSA.

MERGE RULE (per market's MSA)
-----------------------------
  merged[listing_id] = existing rows for the MSA, then overridden by new-export
  rows for the same MSA (the newer pull is authoritative — it's what turns an
  open listing into a closed one with a final rent).
Among multiple --new files, the record with the most-complete/latest event
(has a deactivation_time, else latest creation_time) wins.

ANALYSIS DATE
-------------
Per Jonas: the market's analysis date moves to the LAST listing event we have
for that market — max(creation_time, deactivation_time) across the merged rows,
as YYYY-MM-DD. Written into the patched config's dataAsOf.

Usage:
  # dry-run: report the diff + computed as-of, write nothing
  python merge_listings.py --new EXPORT.csv [--new EXPORT2.csv] [--markets id1,id2]

  # write merged per-market CSVs into the data dir + emit a patched config
  python merge_listings.py --new EXPORT.csv --markets birmingham-al --apply

  --apply       write merged_<market>_<asof>.csv into the data dir AND patch
                markets.json (csvFile + dataAsOf) for the affected markets.
  --data-dir    where per-market CSVs live (default $IQ_DATA_DIR or
                ~/Documents/Claude/Projects/Product Support)
  --config-out  path to write the patched config to (default: markets.json when
                --apply, else <data-dir>/markets.merged-preview.json)
"""

import argparse
import csv
import json
import os
import re
import sys

csv.field_size_limit(sys.maxsize)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.expanduser("~/Documents/Claude/Projects/Product Support")


def event_key(row):
    """Sort key for 'most recent info' — a closed listing (has deactivation)
    beats an open one; ties break on the latest timestamp seen."""
    ct = (row.get("creation_time") or "").strip()
    dt = (row.get("deactivation_time") or "").strip()
    return (1 if dt else 0, dt or "", ct or "")


def load_msa_rows(path, msa_code):
    """Read one CSV, return (fieldnames, {listing_id: row}) for a single MSA.
    On duplicate listing_id within the file, keep the most-recent-info row."""
    out = {}
    fields = None
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        for row in reader:
            if row.get("msa_code") != msa_code:
                continue
            lid = row.get("listing_id")
            if not lid:
                continue
            prev = out.get(lid)
            if prev is None or event_key(row) >= event_key(prev):
                out[lid] = row
    return fields, out


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def _track_date(row, best):
    """Fold a row's creation/deactivation dates into the running max (date-only,
    guarded against column-shifted junk)."""
    for k in ("creation_time", "deactivation_time"):
        v = (row.get(k) or "").strip()
        if _DATE_RE.match(v) and v > best:
            best = v
    return best


def merge_market(mkt, new_paths, data_dir, write):
    """Merge one market's existing MSA rows with the new export(s).

    STREAMS the existing file (which for a mature market can be multi-GB) rather
    than loading it into memory: it write-throughs every existing row whose
    listing_id is NOT superseded by a new-export row, then appends the new rows
    (new wins on overlap). Only the new rows (small) + the overlap listing_ids
    are held in memory, so peak RAM is independent of the existing file size.

    write=True streams to a temp file and renames it to
    merged_<market>_<asof>.csv; write=False (dry-run) streams for stats only.
    Returns a stats dict (+ out_name when written)."""
    msa = mkt["msaCode"]
    existing_path = os.path.join(data_dir, mkt["csvFile"])
    if not os.path.isfile(existing_path):
        return {"error": f"existing csvFile missing: {existing_path}"}

    # New export rows for this MSA (small) — dedupe across --new files by
    # most-recent-info (event_key).
    new = {}
    for np in new_paths:
        _, part = load_msa_rows(np, msa)
        for lid, row in part.items():
            prev = new.get(lid)
            if prev is None or event_key(row) >= event_key(prev):
                new[lid] = row
    new_ids = set(new)

    existing_count = existing_open = 0
    overlap_lids = set()
    open_in_new = open_now_closed = reopened = rent_changed = 0
    best = ""

    tmp_path = os.path.join(data_dir, f".merge_tmp_{mkt['id']}.csv")
    fout = writer = None
    with open(existing_path, newline="", encoding="utf-8", errors="replace") as fe:
        reader = csv.DictReader(fe)
        fields = reader.fieldnames
        if write:
            fout = open(tmp_path, "w", newline="", encoding="utf-8")
            # extrasaction='ignore' tolerates a column-shifted malformed source
            # row (overflow under DictReader's None restkey) — consistent with
            # how the pipeline reads those same rows.
            writer = csv.DictWriter(fout, fieldnames=fields, extrasaction="ignore", restval="")
            writer.writeheader()
        for row in reader:
            if row.get("msa_code") != msa:
                continue
            lid = row.get("listing_id")
            if not lid:
                continue
            existing_count += 1
            e_deact = (row.get("deactivation_time") or "").strip()
            e_open = not e_deact
            if e_open:
                existing_open += 1
            best = _track_date(row, best)
            if lid in new_ids:
                overlap_lids.add(lid)
                n = new[lid]
                n_deact = (n.get("deactivation_time") or "").strip()
                if e_open:
                    open_in_new += 1
                    if n_deact:
                        open_now_closed += 1
                if e_deact and not n_deact:
                    reopened += 1
                if (row.get("rent_amount") or "").strip() != (n.get("rent_amount") or "").strip():
                    rent_changed += 1
                # New row supersedes this existing one; written in the append below.
            elif write:
                writer.writerow(row)

    # Append the new-export rows (overlap winners + brand-new).
    for row in new.values():
        if write:
            writer.writerow(row)
        best = _track_date(row, best)
    if fout:
        fout.close()

    as_of = best[:10] if best else None
    brand_new = len(new_ids - overlap_lids)
    merged_count = existing_count - len(overlap_lids) + len(new)

    out_name = None
    if write:
        out_name = f"merged_{mkt['id']}_{(as_of or 'na').replace('-', '')}.csv"
        os.replace(tmp_path, os.path.join(data_dir, out_name))

    return {
        "market": mkt["id"],
        "msa": msa,
        "out_name": out_name,
        "existing_count": existing_count,
        "new_count": len(new),
        "overlap": len(overlap_lids),
        "brand_new": brand_new,
        "existing_open": existing_open,
        "open_in_new": open_in_new,
        "open_now_closed": open_now_closed,
        "reopened": reopened,
        "rent_changed": rent_changed,
        "merged_count": merged_count,
        "as_of": as_of,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--new", action="append", required=True, help="new export CSV (repeatable)")
    p.add_argument("--markets", default=None, help="comma-separated market ids (default: all whose MSA is in the new export)")
    p.add_argument("--config", default=os.path.join(SCRIPT_DIR, "markets.json"))
    p.add_argument("--data-dir", default=None)
    p.add_argument("--config-out", default=None)
    p.add_argument("--apply", action="store_true", help="write merged CSVs + patch config")
    args = p.parse_args()

    data_dir = args.data_dir or os.environ.get("IQ_DATA_DIR") or DEFAULT_DATA_DIR
    if not os.path.isdir(data_dir):
        sys.exit(f"[merge] data-dir does not exist: {data_dir}")
    for np in args.new:
        if not os.path.isfile(np):
            sys.exit(f"[merge] --new file not found: {np}")

    cfg = json.load(open(args.config))
    markets = cfg["markets"]

    # Which MSAs are present in the new export(s)?
    new_msas = set()
    for np in args.new:
        with open(np, newline="", encoding="utf-8", errors="replace") as f:
            for row in csv.DictReader(f):
                new_msas.add(row.get("msa_code"))

    if args.markets:
        want = set(args.markets.split(","))
        targets = [m for m in markets if m["id"] in want]
    else:
        targets = [m for m in markets if m["msaCode"] in new_msas]

    if not targets:
        sys.exit("[merge] no target markets (new export MSAs: %s)" % sorted(x for x in new_msas if x))

    print(f"[merge] data-dir={data_dir}")
    print(f"[merge] new export(s): {', '.join(os.path.basename(n) for n in args.new)}")
    print(f"[merge] new-export MSAs: {sorted(x for x in new_msas if x)}")
    print(f"[merge] targets: {[m['id'] for m in targets]}  ({'APPLY' if args.apply else 'DRY-RUN'})\n")

    results = []
    for mkt in targets:
        r = merge_market(mkt, args.new, data_dir, write=args.apply)
        if "error" in r:
            print(f"  ! {mkt['id']}: {r['error']}")
            continue
        results.append(r)
        print(
            f"  {r['market']:40s} MSA {r['msa']}\n"
            f"      existing={r['existing_count']:6d}  new-in-export={r['new_count']:5d}  "
            f"overlap={r['overlap']:5d}  brand-new={r['brand_new']:5d}\n"
            f"      existing-open={r['existing_open']:5d}  covered-by-new={r['open_in_new']:5d}  "
            f"open→closed={r['open_now_closed']:5d}  rent-changed={r['rent_changed']:4d}  reopened={r['reopened']}\n"
            f"      => merged={r['merged_count']:6d} rows   as-of={r['as_of']}"
        )
        if r["open_in_new"] < r["existing_open"]:
            gap = r["existing_open"] - r["open_in_new"]
            print(f"      ⚠ {gap} previously-open listing(s) NOT re-reported by the new export "
                  f"(their open-tail isn't refreshed — consider a wider export scope).")

    if not args.apply:
        print("\n[merge] DRY-RUN — nothing written. Re-run with --apply to write merged CSVs + patch config.")
        return

    # merge_market already streamed each merged CSV to disk; just patch the
    # config (csvFile + dataAsOf) from the returned filenames.
    patched = {m["id"]: m for m in markets}
    for r in results:
        patched[r["market"]]["csvFile"] = r["out_name"]
        if r["as_of"]:
            patched[r["market"]]["dataAsOf"] = r["as_of"]
        print(f"  ✓ wrote {r['out_name']} ({r['merged_count']} rows), as-of {r['as_of']}")

    config_out = args.config_out or args.config
    json.dump(cfg, open(config_out, "w"), indent=2)
    print(f"\n[merge] patched config written to {config_out}")
    print("[merge] next: run pipeline.py per merged market, then normalize → merge.py → re-seed.")


if __name__ == "__main__":
    main()
