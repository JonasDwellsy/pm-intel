"""Spool one market's database rows to a snapshot CSV, once.

pipeline.py reads a market's rows twice -- an auto-merge pre-pass and the
main pass (see pipeline.py around CSV_PATH). Pointing both reads at a live
`dwellsy_source.market_listings` generator would pull the database twice
(~75-100s each for a market the size of Kansas City) and risks the two
passes seeing different data if anything changed between pulls. Instead,
`--source db` pulls once through this module, writes the rows to a plain
CSV, and pipeline.py's CSV_PATH points at that file -- the two existing
`csv.DictReader(CSV_PATH)` read sites are then unchanged and read the same
snapshot.

`ensure_snapshot` is the entry point pipeline.py calls. It also supports
reusing a snapshot pulled by an earlier run (e.g. the trajectory backfill,
which runs the pipeline hundreds of times and wants one pull shared across
all of them) via an explicit path, without touching the database again.
"""
import csv
import json
import os
import tempfile
from datetime import date, datetime, timezone
from typing import Callable, Iterable, Iterator
from zoneinfo import ZoneInfo

import dwellsy_source

# Timestamps in the source data are Pacific wall-clock (see
# dwellsy_source.py's BASE_SQL, which converts creation_time/deactivation_time
# `at time zone 'America/Los_Angeles'`), so the snapshot's own "as of" date is
# expressed in the same zone, not UTC -- a pull made at 11pm Pacific and one
# made 90 minutes later, past midnight UTC, should not disagree about which
# calendar day the data is "as of".
PACIFIC = ZoneInfo("America/Los_Angeles")


def default_snapshot_path(out_dir: str, output_slug: str, pulled_on: date) -> str:
    """Where a snapshot lands when the caller doesn't name one explicitly."""
    return os.path.join(out_dir, f"db_snapshot_{output_slug}_{pulled_on:%Y%m%d}.csv")


def _meta_path(path: str) -> str:
    return path + ".meta.json"


def _pulled_on_pacific(instant_utc: datetime) -> str:
    return instant_utc.astimezone(PACIFIC).date().isoformat()


def write_snapshot(rows: Iterable[dict], path: str, meta: dict) -> dict:
    """Write `rows` to `path` as CSV, atomically, and a `<path>.meta.json`
    sidecar alongside it.

    The header comes from the first row; csv.DictWriter's default
    extrasaction="raise" means a later row carrying a key the header
    doesn't have fails loudly rather than silently dropping data.

    Written atomically: `rows` is consumed into a temp file in the same
    directory as `path`, which is then moved into place with os.replace
    only once every row has been written successfully. A pull that raises
    partway through leaves neither the temp file nor `path` behind, and the
    exception propagates to the caller -- a later run pointed at the same
    `path` will not mistake a partial pull for a complete one.

    `meta` supplies the caller's fields (msa_code, pulled_at,
    pulled_on_pacific, source); this function fills in `row_count` and
    `reader_stats` (a copy of `dwellsy_source.LAST_RUN_STATS`, only settled
    once the row generator above has been fully consumed) and writes+returns
    the combined dict.
    """
    out_dir = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp_path = tempfile.mkstemp(
        dir=out_dir, prefix=os.path.basename(path) + ".", suffix=".tmp"
    )
    row_count = 0
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as fh:
            writer = None
            for row in rows:
                if writer is None:
                    writer = csv.DictWriter(fh, fieldnames=list(row.keys()))
                    writer.writeheader()
                writer.writerow(row)
                row_count += 1
    except BaseException:
        os.remove(tmp_path)
        raise
    os.replace(tmp_path, path)

    full_meta = dict(meta)
    full_meta["row_count"] = row_count
    # Reuse checks the file against this size, so a snapshot truncated by an
    # interrupted copy between machines is refused rather than silently read.
    full_meta["size_bytes"] = os.path.getsize(path)
    full_meta["reader_stats"] = dict(dwellsy_source.LAST_RUN_STATS)
    full_meta.setdefault("source", "dwellsy_db")
    meta_path = _meta_path(path)
    fd, tmp_meta = tempfile.mkstemp(
        dir=out_dir, prefix=os.path.basename(meta_path) + ".", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(full_meta, fh, indent=2, sort_keys=True)
    except BaseException:
        os.remove(tmp_meta)
        raise
    os.replace(tmp_meta, meta_path)
    return full_meta


def read_meta(path: str) -> dict:
    with open(_meta_path(path), encoding="utf-8") as fh:
        return json.load(fh)


def ensure_snapshot(
    msa_code: str,
    out_dir: str,
    output_slug: str,
    snapshot_path: str | None = None,
    pull: Callable[[str], Iterator[dict]] = dwellsy_source.market_listings,
) -> tuple[str, dict]:
    """Return (path, meta) for a snapshot of `msa_code`, pulling only when
    there isn't already a complete one to reuse.

    - `snapshot_path` given, and both it and its `.meta.json` already exist:
      reused as-is without calling `pull` -- after checking the existing
      meta's msa_code against the one requested here, since a mismatch
      means this snapshot belongs to a different market entirely and
      silently proceeding would run the whole pipeline against the wrong
      market's data -- and against the meta's recorded size_bytes, so a
      truncated copy is refused.
    - `snapshot_path` given but missing (or its meta is): pulled and written
      there.
    - `snapshot_path` omitted: pulled and written to
      `default_snapshot_path` for today's Pacific date.
    """
    if snapshot_path is not None and os.path.isfile(snapshot_path) and os.path.isfile(
        _meta_path(snapshot_path)
    ):
        meta = read_meta(snapshot_path)
        existing_msa = meta.get("msa_code")
        if existing_msa != msa_code:
            raise ValueError(
                f"existing snapshot at {snapshot_path!r} is for msa_code "
                f"{existing_msa!r}, not the requested {msa_code!r} -- point "
                f"--db-snapshot at the right file, or omit it to pull fresh"
            )
        expected_size = meta.get("size_bytes")
        actual_size = os.path.getsize(snapshot_path)
        if expected_size != actual_size:
            raise ValueError(
                f"snapshot at {snapshot_path!r} is {actual_size:,} bytes but its "
                f"meta records {expected_size!r} -- the file is truncated, "
                f"altered, or predates size tracking; delete it (and its "
                f".meta.json) to pull fresh"
            )
        return snapshot_path, meta

    path = snapshot_path or default_snapshot_path(out_dir, output_slug, _pacific_today())
    pulled_at = datetime.now(timezone.utc)
    meta_in = {
        "msa_code": msa_code,
        "pulled_at": pulled_at.isoformat(),
        "pulled_on_pacific": _pulled_on_pacific(pulled_at),
        "source": "dwellsy_db",
    }
    meta = write_snapshot(pull(msa_code), path, meta_in)
    return path, meta


def _pacific_today() -> date:
    return datetime.now(timezone.utc).astimezone(PACIFIC).date()
