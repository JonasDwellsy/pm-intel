"""Superset reconciliation: the acceptance gate for the whole DB-source
migration. Proves the database read loses nothing the export had, and
characterises what it adds.

Byte-identical output is impossible once we take the full history instead of
a dated pull, so this is the acceptance test instead:

- An export row with no database match under the SAME listing_id is either
  explained by the population filter (fine -- the export was never a superset
  of the filtered population to begin with, see field_mapping.md's population
  section) or it is a migration bug (broken join, wrong filter, timezone
  slip). `classify_export_only_row` tells those two apart per-row by running
  every population predicate as its own boolean column against the
  UNFILTERED base join, restricted to just the export-only ids.
- A database row with no export match is data we were not receiving. It is
  never a failure; it is counted and characterised into
  before_export_history / after_export_asof / other (the unexplained
  population gap -- field_mapping.md open question 3).
- Field-level parity on matched rows is a third, independent check: the
  reader must not just cover the same rows, it must agree on their values,
  within a measured-and-justified threshold per field (FIELD_THRESHOLDS).

Key = listing_id (Task 2 proved export listing_id == property_listing_table.id
1:1, and the reader emits it -- this supersedes the original brief's
(uru_id, creation date) key).
"""
import argparse
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

csv.field_size_limit(10**9)

# ---------------------------------------------------------------------------
# Keys
# ---------------------------------------------------------------------------


def listing_key(row: dict):
    """The reconciliation key: listing_id. None when blank -- unresolved
    rows must NEVER share a key (two blanks would otherwise look like a
    match)."""
    lid = (row.get("listing_id") or "").strip()
    return lid or None


def build_key_set(rows) -> set:
    """Keys for every row, dropping blanks so they never collapse together."""
    return {k for k in (listing_key(r) for r in rows) if k}


# ---------------------------------------------------------------------------
# Blank / numeric / count normalisation
#
# The pipeline treats '' and 'null' as missing (field_mapping.md, "Notes for
# Task 3 on output shape"), and reads numeric text through safe_int/safe_float
# (pipeline.py), which tolerate '1450.00' the same as '1450'. Field
# comparison here must apply the SAME tolerance, or a value the pipeline
# treats as identical would be reported as a parity miss.
# ---------------------------------------------------------------------------


def _norm_blank(v) -> str:
    v = (v or "").strip()
    return "" if v.lower() == "null" else v


def _to_number(v):
    v = _norm_blank(v)
    if not v:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _count_parts(v) -> int:
    v = _norm_blank(v)
    return len([x for x in v.split(";") if x.strip()]) if v else 0


def _values_match(comparator: str, export_val, db_val) -> bool:
    if comparator == "numeric":
        return _to_number(export_val) == _to_number(db_val)
    if comparator == "count":
        return _count_parts(export_val) == _count_parts(db_val)
    return _norm_blank(export_val) == _norm_blank(db_val)


# ---------------------------------------------------------------------------
# Tolerance comparators (Fix round 2)
#
# Controller ruling on the 3 fields still BLOCKED after Fix round 1
# (latitude, longitude, top_down_community_count): round 1's diagnosis found
# a real post-export value change with no tracking timestamp anywhere in the
# schema (checked last_update_time, ss_update_time, ss_pro_update_time for
# coordinates; last_update_time, significant_updates_time for the community
# roster) -- so these fields switch from exact/drift-only to a comparator
# that fits how each is actually used, on top of (not instead of) the
# existing drift split. Thresholds are UNCHANGED (0.99 for both); they now
# apply to the tolerance-agreement rate on non-drifted rows, and the exact
# rate is still reported alongside every tolerance rate, never hidden.
# ---------------------------------------------------------------------------

LATLON_TOLERANCE_DEG = 0.001
# ~111m of latitude, ~86m of longitude at Kansas City's 39 degrees N.
# Coordinates are re-geocoded by a background process that updates no
# timestamp we have access to (Fix round 1 checked property_table /
# address_line1_table's last_update_time, ss_update_time and
# ss_pro_update_time -- all stale on every non-drifted mismatch sample). The
# pipeline uses these coordinates for maps and market geography, where a
# ~100m difference is immaterial. Round 0's diagnosis already found 98.7% of
# Kansas City's latitude mismatches were within 100m (median ~2m); this
# tolerance formalizes that finding as the pass bar instead of exact
# equality, rather than papering over it with a wider miss-rate threshold.


def _community_count_tolerance(export_value: float) -> float:
    """max(2, 10% of the export's count). top_down_community_count is a
    community roster aggregate (address_community_table.count_top_down)
    recomputed by some process that touches no timestamp we can see
    (Fix round 1: last_update_time was years stale and significant_updates_time
    was NULL on every non-drifted mismatch sample) -- it is current state by
    construction, not a point-in-time snapshot. A flat absolute tolerance
    would be too loose for a 4-unit building and too tight for a 400-unit
    complex; a flat percentage would be too loose for tiny communities (10%
    of 1 rounds to nothing). The floor of 2 and the 10%-of-export scale
    exist for exactly those two ends of the size range."""
    return max(2.0, 0.10 * export_value)


TOLERANCE_FUNCS = {
    "latitude": lambda export_value: LATLON_TOLERANCE_DEG,
    "longitude": lambda export_value: LATLON_TOLERANCE_DEG,
    "top_down_community_count": _community_count_tolerance,
}


def tolerance_match(field: str, export_val, db_val) -> tuple[bool, bool]:
    """(exact_match, within_tolerance) for a field in TOLERANCE_FUNCS.
    Blank/null on exactly one side is a mismatch on BOTH measures (a value
    appearing or disappearing is never "within tolerance" of nothing);
    blank on both sides matches on both (nothing to disagree about)."""
    e = _to_number(export_val)
    d = _to_number(db_val)
    if e is None and d is None:
        return True, True
    if e is None or d is None:
        return False, False
    exact = e == d
    within = exact or abs(e - d) <= TOLERANCE_FUNCS[field](e)
    return exact, within


COMMUNITY_COUNT_DIFF_BUCKETS = ("1", "2", "3-5", "6-10", "11-25", ">25", "negative")


def community_count_diff_bucket(diff: int) -> str:
    """Buckets a signed (db - export) top_down_community_count difference
    for the diagnostic histogram -- not gated by tolerance, so it shows the
    full shape of non-drifted disagreement (including differences small
    enough to already pass tolerance) for judging whether any individual
    jump looks anomalous."""
    if diff < 0:
        return "negative"
    if diff == 1:
        return "1"
    if diff == 2:
        return "2"
    if 3 <= diff <= 5:
        return "3-5"
    if 6 <= diff <= 10:
        return "6-10"
    if 11 <= diff <= 25:
        return "11-25"
    return ">25"


# ---------------------------------------------------------------------------
# Field-level parity on matched rows
#
# field name -> (export column, reader-emitted key, comparator). Most fields
# share one name on both sides; one doesn't:
#   - "amenities_string": the same `amenities` value on both sides, compared
#     exactly (not by count) -- field_mapping.md's separate 98.6% exact-string
#     measurement, distinct from the 98.7% by-count measurement used by
#     "amenities".
#
# property_id (internal, p.id) and msa_code/listing_id (used as filter/key,
# trivially equal by construction) are not export columns and are not
# compared here.
# ---------------------------------------------------------------------------
FIELD_SPECS: dict[str, tuple[str, str, str]] = {
    "uru_id":                   ("uru_id",                   "uru_id",                   "exact"),
    "community_id":              ("community_id",             "community_id",             "exact"),
    "address1_id":               ("address1_id",               "address1_id",               "exact"),
    "address_1":                 ("address_1",                 "address_1",                 "exact"),
    "address_city":               ("address_city",              "address_city",              "exact"),
    "address_type":               ("address_type",              "address_type",              "exact"),
    "bedrooms":                   ("bedrooms",                  "bedrooms",                  "numeric"),
    "latitude":                   ("latitude",                  "latitude",                  "tolerance"),
    "longitude":                  ("longitude",                 "longitude",                 "tolerance"),
    "child_company_id":           ("child_company_id",          "child_company_id",          "exact"),
    "rent_amount":                ("rent_amount",               "rent_amount",               "numeric"),
    "description":                ("description",               "description",               "exact"),
    "creation_time":               ("creation_time",             "creation_time",             "exact"),
    "deactivation_time":           ("deactivation_time",         "deactivation_time",         "exact"),
    "property_listing_status":     ("property_listing_status",   "property_listing_status",   "exact"),
    "top_down_community_count":    ("top_down_community_count",  "top_down_community_count",  "tolerance"),
    "amenities":                   ("amenities",                 "amenities",                 "count"),
    "amenities_string":            ("amenities",                 "amenities",                 "exact"),
    "photos":                      ("photos",                    "photos",                    "count"),

    # Operator identity from the company hierarchy -- see dwellsy_source.py's
    # module docstring and field_mapping.md's "Parent company vs
    # organization". export_col == reader_key for all five, since the reader
    # emits these under the export's own column names.
    "company_name":                ("company_name",              "company_name",              "exact"),
    "child_company_type":           ("child_company_type",        "child_company_type",        "exact"),
    "parent_company_id":            ("parent_company_id",         "parent_company_id",         "exact"),
    "parent_company_name":          ("parent_company_name",       "parent_company_name",       "exact"),
    "parent_company_type":          ("parent_company_type",       "parent_company_type",       "exact"),
}

# Every export column now has a reader-emitted source (Task 6 closed the
# last gap: the five company-identity fields below). Kept as an explicit
# empty tuple, not deleted, so the constant and its reporting
# (`_compose_result`'s `not_yet_emitted`, the CLI summary's "not yet
# emitted" line) stay in place for any field a future task adds here.
NOT_YET_EMITTED: tuple[str, ...] = ()

# Thresholds = field_mapping.md's measured agreement rate (2026-09-26,
# Bozeman n=1000 unless noted) minus a margin for drift between that probe
# and whenever this gate runs. Two anchor points, given in the task: a field
# measured at 1.0 gets margin 0.01 (threshold >= 0.99); a field measured at
# ~0.97 gets margin ~0.04 (threshold >= 0.93, the photos-count case below,
# verbatim). Margin widens as the measured rate drops, since a field that
# already disagrees more often has more room for further live drift.
#
# Fix round 1 (controller ruling on the Kansas City BLOCKED finding): every
# threshold below now applies to the NON-DRIFTED rate -- rows whose source
# record(s) did not change after the export's as-of date (see
# FIELD_DRIFT_GROUP / compare_matched_fields below). information_schema
# confirmed all six source tables the controller asked about
# (property_table, address_line1_table, address_line2_table,
# address_community_table, company_table, property_amenity_table) carry
# `last_update_time`, so no field here falls back to the all-rows rate; the
# one documented exception is amenities' delete-blind-spot (the drift signal
# is incomplete there, not absent -- see its comment below).
FIELD_THRESHOLDS: dict[str, float] = {
    "uru_id": 0.99,                    # measured 100.0% (1000/1000), applies to the non-drifted rate
    "community_id": 0.99,               # measured 100.0% (1000/1000), applies to the non-drifted rate
    "address1_id": 0.99,                # measured 100.0% (1000/1000), applies to the non-drifted rate
    "address_1": 0.99,                  # measured 100.0% (1000/1000), applies to the non-drifted rate
    "address_city": 0.99,               # measured 100.0% (1000/1000), applies to the non-drifted rate
    "address_type": 0.99,               # measured 100.0% (1000/1000), applies to the non-drifted rate
    "bedrooms": 0.99,                   # measured 100.0% (coalesce form, 1000/1000), applies to the non-drifted rate
    "latitude": 0.99,                   # measured 100.0% (1000/1000). Fix round 2: applies to the
                                         # TOLERANCE-agreement rate (see LATLON_TOLERANCE_DEG) on
                                         # non-drifted rows -- coordinates are re-geocoded by a process
                                         # that updates no timestamp we have (round 1 checked
                                         # last_update_time/ss_update_time/ss_pro_update_time), and the
                                         # pipeline only needs ~100m precision for maps/market geography
    "longitude": 0.99,                  # measured 100.0% (1000/1000). Fix round 2: same tolerance rate,
                                         # same rationale as latitude (see LATLON_TOLERANCE_DEG)
    "child_company_id": 0.99,           # measured 100.0% (1000/1000 + 12,935/12,935 whole-export), non-drifted rate
    "rent_amount": 0.99,                # measured 99.9% (999/1000; the 1 miss was rewritten after the pull), non-drifted rate
    "creation_time": 0.99,               # measured 100.0% (1000/1000), applies to the non-drifted rate
    "top_down_community_count": 0.99,   # measured 100.0% (1000/1000). Fix round 2: applies to the
                                         # TOLERANCE-agreement rate (see _community_count_tolerance) on
                                         # non-drifted rows -- this is a community roster aggregate
                                         # recomputed by a process that updates no timestamp we have
                                         # (round 1: last_update_time stale, significant_updates_time
                                         # NULL), current state by construction, not a point-in-time
                                         # snapshot
    "description": 0.98,                # measured 99.6% (996/1000), applies to the non-drifted rate
    "deactivation_time": 0.97,          # measured 99.2% (992/1000; misses are post-pull closures), non-drifted rate
    "property_listing_status": 0.97,    # measured 99.2% (992/1000; misses are post-pull state changes), non-drifted rate
    "amenities": 0.95,                  # measured 98.7% by count (987/1000), applies to the non-drifted rate.
                                         # LIMITATION: property_amenity_table has no delete-audit table
                                         # (unlike photos' deleted_property_media_table), so a property
                                         # whose amenities were entirely removed after as_of is invisible to
                                         # the drift check and scored as non-drifted -- the non-drifted rate
                                         # is therefore a slight UNDER-estimate of true agreement on rows
                                         # that really didn't change
    "amenities_string": 0.95,           # measured 98.6% exact string (986/1000), non-drifted rate (see amenities)
    "photos": 0.93,                     # measured 96.9% by count (969/1000) -- the task's own worked
                                         # example, applies to the non-drifted rate. KC's large swings traced
                                         # to specific parent properties with deleted_property_media_table
                                         # activity after as_of (e.g. parent 20357449, 2026-09-22..25): drift,
                                         # not a reader bug
    "company_name": 0.99,               # measured 100% (12,935/12,935, field_mapping.md), non-drifted rate
    "child_company_type": 0.99,         # measured 100% (12,935/12,935, field_mapping.md), non-drifted rate
    "parent_company_id": 0.99,          # measured 100% (12,935/12,935, field_mapping.md), non-drifted rate
    "parent_company_name": 0.99,        # measured 100% (12,935/12,935, field_mapping.md), non-drifted rate
    "parent_company_type": 0.99,        # measured 100% (12,935/12,935, field_mapping.md), non-drifted rate
}

# ---------------------------------------------------------------------------
# Drift-aware field comparison (Fix round 1)
#
# One field -> drift-group map, and one drift-group -> source-tables map.
# `company_table` was checked via information_schema (it does have
# last_update_time) and backs the five operator-identity fields below via
# the "company" group.
#
# `child_company_id` stays on "property_address", not "company": its VALUE
# is `p.company_id` (a property_table foreign-key assignment -- see
# dwellsy_source.py's BASE_SQL), so what would make it drift is the
# property's own company reassignment, which bumps `p.last_update_time` and
# is already caught by the property_address group. A company_table rename or
# re-type (what the "company" group watches) changes none of
# child_company_id's own value. This is not a case of child_company_id
# having been mapped to property_address "only for lack of a company group"
# -- it is the group its value actually depends on -- so it was left
# unmoved.
FIELD_DRIFT_GROUP: dict[str, str] = {
    "uru_id": "property_address",
    "community_id": "property_address",
    "address1_id": "property_address",
    "address_1": "property_address",
    "address_city": "property_address",
    "address_type": "property_address",
    "bedrooms": "property_address",
    "latitude": "property_address",
    "longitude": "property_address",
    "child_company_id": "property_address",
    "rent_amount": "listing",
    "description": "listing",
    "creation_time": "listing",
    "deactivation_time": "listing",
    "property_listing_status": "listing",
    "top_down_community_count": "community",
    "amenities": "amenities",
    "amenities_string": "amenities",
    "photos": "photos",
    "company_name": "company",
    "child_company_type": "company",
    "parent_company_id": "company",
    "parent_company_name": "company",
    "parent_company_type": "company",
}

# Deliberately coarse per the controller's own grouping: e.g. every field in
# "property_address" shares ONE drift flag (p OR a1 OR a2 changed), even
# though not every field in the group depends on all three tables. This can
# over-flag drift for an individual field (an a1-only change also excuses
# company_id, which only ever reads p) but never UNDER-flags it for the
# field(s) that really do depend on whichever table changed -- the safe
# direction for an acceptance gate: it only ever shrinks the strict
# "non-drifted" pool, never hides a mismatch inside it.
DRIFT_GROUP_SOURCE_TABLES: dict[str, tuple[str, ...]] = {
    "listing": ("dwellsy_prod.property_listing_table",),
    "property_address": (
        "dwellsy_prod.property_table",
        "dwellsy_prod.address_line1_table",
        "dwellsy_prod.address_line2_table",
    ),
    "community": ("dwellsy_prod.address_community_table",),
    "amenities": ("dwellsy_prod.property_amenity_table",),
    "photos": (
        "dwellsy_prod.property_media_table",
        "dwellsy_prod.deleted_property_media_table",
    ),
    # company_table only (not company_type_table): the same deliberately
    # coarse choice as every other group -- e.g. child_company_type reads
    # ct.type via c.company_type_id, but company_type_table's own
    # last_update_time is not tracked here, mirroring how "property_address"
    # already omits address_type_table's for the address_type field. A
    # lookup-vocabulary table's own row almost never changes, and even if it
    # did this can only ever shrink the non-drifted pool, never hide a
    # mismatch inside it.
    "company": ("dwellsy_prod.company_table",),
}

DRIFT_CHUNK = 2000


def _chunked(seq, size):
    seq = list(seq)
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def _as_of_ts(as_of: str) -> str:
    """as_of ('YYYY-MM-DD') as a UTC-midnight timestamptz literal, used as
    the drift cutoff against `timestamp with time zone` columns. Comparing
    from midnight (rather than an exact, unknown pull time) is deliberately
    conservative: an update made earlier on the as_of calendar day, before
    the actual export pull, would be misclassified as drift -- but that only
    shrinks the non-drifted pool, it never lets a real reader bug hide as
    drift."""
    return f"{as_of} 00:00:00+00"


AS_OF_FILENAME_RE = re.compile(r"_(\d{4})(\d{2})(\d{2})\.csv$")


def parse_as_of(csv_path: str, explicit: "str | None" = None) -> str:
    """The export's as-of date, 'YYYY-MM-DD'. An explicit --as-of wins;
    otherwise it's derived from the CSV filename's trailing _YYYYMMDD (both
    validation files: merged_..._20260908.csv -> 2026-09-08). Raises
    ValueError with a clear message when neither is available -- drift-aware
    comparison has no meaning without a cut date."""
    if explicit:
        try:
            from datetime import date

            y, m, d = explicit.split("-")
            date(int(y), int(m), int(d))
        except Exception as exc:
            raise ValueError(f"--as-of must be YYYY-MM-DD, got {explicit!r}") from exc
        return explicit
    match = AS_OF_FILENAME_RE.search(os.path.basename(csv_path))
    if not match:
        raise ValueError(
            f"no --as-of given and {csv_path!r} has no trailing _YYYYMMDD.csv "
            "suffix to derive an as-of date from"
        )
    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"


def fetch_listing_drift(as_of: str, listing_ids) -> dict:
    """{listing_id: bool} -- property_listing_table l.last_update_time, the
    single source table for rent_amount/property_listing_status/
    deactivation_time/description/creation_time (all read straight off l)."""
    import dwellsy_db

    as_of_ts = _as_of_ts(as_of)
    result: dict[str, bool] = {}
    for chunk in _chunked(sorted(int(x) for x in listing_ids), DRIFT_CHUNK):
        rows = dwellsy_db.query(
            """
            select l.id::text as listing_id,
                   (l.last_update_time > %(as_of)s) as drifted
              from dwellsy_prod.property_listing_table l
             where l.id = any(%(ids)s::bigint[])
            """,
            {"ids": chunk, "as_of": as_of_ts},
        )
        for row in rows:
            result[row["listing_id"]] = bool(row["drifted"])
    return result


def fetch_property_context(as_of: str, property_ids) -> dict:
    """{property_id: {"property_address": bool, "community": bool,
    "parent_property_id": str | None}} in one round trip per chunk:
    property_table p / address_line1_table a1 / address_line2_table a2 (the
    "property_address" group) and, via p.community_id,
    address_community_table ac.last_update_time (the "community" group,
    top_down_community_count) -- plus p.parent_property_id, which the
    reader's emitted rows don't carry (dwellsy_source pops it internally
    after building amenities/photos), needed here for the photos drift
    check's own∪parent union. All joins are to-one (p.address1_id/
    address2_id/community_id are FKs to each target's PRIMARY KEY id), so
    this can't fan out."""
    import dwellsy_db

    as_of_ts = _as_of_ts(as_of)
    result: dict[str, dict] = {}
    for chunk in _chunked(sorted(int(x) for x in property_ids), DRIFT_CHUNK):
        rows = dwellsy_db.query(
            """
            select p.id::text as property_id,
                   p.parent_property_id::text as parent_property_id,
                   (p.last_update_time > %(as_of)s
                    or a1.last_update_time > %(as_of)s
                    or a2.last_update_time > %(as_of)s) as property_address_drifted,
                   coalesce(ac.last_update_time > %(as_of)s, false) as community_drifted
              from dwellsy_prod.property_table p
              left join dwellsy_prod.address_line1_table a1 on a1.id = p.address1_id
              left join dwellsy_prod.address_line2_table a2 on a2.id = p.address2_id
              left join dwellsy_prod.address_community_table ac on ac.id = p.community_id
             where p.id = any(%(ids)s::bigint[])
            """,
            {"ids": chunk, "as_of": as_of_ts},
        )
        for row in rows:
            result[row["property_id"]] = {
                "property_address": bool(row["property_address_drifted"]),
                "community": bool(row["community_drifted"]),
                "parent_property_id": row["parent_property_id"],
            }
    return result


def fetch_amenities_drift(as_of: str, property_ids) -> dict:
    """{property_id: bool} -- property_amenity_table rows for the property
    itself (field_mapping.md: amenities are grained to the property; the
    parent is not included). A row inserted or touched after as_of counts as
    drift. See FIELD_THRESHOLDS' amenities comment for the delete-blind-spot
    limitation this implies."""
    import dwellsy_db

    as_of_ts = _as_of_ts(as_of)
    result: dict[str, bool] = {}
    for chunk in _chunked(sorted(int(x) for x in property_ids), DRIFT_CHUNK):
        rows = dwellsy_db.query(
            """
            select pa.property_id::text as property_id,
                   bool_or(pa.creation_time > %(as_of)s
                           or pa.last_update_time > %(as_of)s) as drifted
              from dwellsy_prod.property_amenity_table pa
             where pa.property_id = any(%(ids)s::bigint[])
             group by pa.property_id
            """,
            {"ids": chunk, "as_of": as_of_ts},
        )
        for row in rows:
            result[row["property_id"]] = bool(row["drifted"])
    return result


def fetch_photos_drift(as_of: str, media_ids) -> dict:
    """{id: bool} for every id in media_ids (a property id or a parent
    property id -- the caller unions both before calling this), true when
    property_media_table has a row created/updated after as_of, OR
    deleted_property_media_table has a row deleted after as_of, for that id.
    Two grouped queries per chunk, not a join -- avoids any fan-out between
    the two tables."""
    import dwellsy_db

    as_of_ts = _as_of_ts(as_of)
    result: dict[str, bool] = {}
    for chunk in _chunked(sorted(int(x) for x in media_ids), DRIFT_CHUNK):
        media_rows = dwellsy_db.query(
            """
            select mp.property_id::text as property_id,
                   bool_or(mp.creation_time > %(as_of)s
                           or mp.last_update_time > %(as_of)s) as drifted
              from dwellsy_prod.property_media_table mp
             where mp.property_id = any(%(ids)s::bigint[])
             group by mp.property_id
            """,
            {"ids": chunk, "as_of": as_of_ts},
        )
        for row in media_rows:
            result[row["property_id"]] = result.get(row["property_id"], False) or bool(
                row["drifted"]
            )
        deleted_rows = dwellsy_db.query(
            """
            select dmp.property_id::text as property_id,
                   bool_or(dmp.deletion_time > %(as_of)s) as drifted
              from dwellsy_prod.deleted_property_media_table dmp
             where dmp.property_id = any(%(ids)s::bigint[])
             group by dmp.property_id
            """,
            {"ids": chunk, "as_of": as_of_ts},
        )
        for row in deleted_rows:
            result[row["property_id"]] = result.get(row["property_id"], False) or bool(
                row["drifted"]
            )
    return result


def fetch_company_drift(as_of: str, company_ids) -> dict:
    """{company_id: bool} -- true when company_table.last_update_time is
    after as_of for the company itself OR its parent (a self-join, still
    to-one: `c.parent_company_id` targets `company_table.id`, its PRIMARY
    KEY, so this can't fan out). Backs the five Task 6 identity fields
    (company_name, child_company_type, parent_company_id,
    parent_company_name, parent_company_type) -- all five read off either
    `c` or `pc` (see dwellsy_source.py's BASE_SQL), so one boolean per
    company covers all of them, the same deliberately-coarse-per-group
    choice as every other drift group here. An EXISTS-shaped boolean
    expression, not a join that could return more than one row per company
    -- no fan-out possible since the self-join target is a PRIMARY KEY."""
    import dwellsy_db

    as_of_ts = _as_of_ts(as_of)
    result: dict[str, bool] = {}
    for chunk in _chunked(sorted(int(x) for x in company_ids), DRIFT_CHUNK):
        rows = dwellsy_db.query(
            """
            select c.id::text as company_id,
                   (c.last_update_time > %(as_of)s
                    or coalesce(pc.last_update_time > %(as_of)s, false)) as drifted
              from dwellsy_prod.company_table c
              left join dwellsy_prod.company_table pc on pc.id = c.parent_company_id
             where c.id = any(%(ids)s::bigint[])
            """,
            {"ids": chunk, "as_of": as_of_ts},
        )
        for row in rows:
            result[row["company_id"]] = bool(row["drifted"])
    return result


def company_row_drifted(
    company_id: str, company_drift_by_company: dict, property_drifted: bool
) -> bool:
    """Identity fields change when the company's own row changes AND when the
    property is reassigned to another company. A reassignment rewrites
    p.company_id (bumping p.last_update_time, the property_address signal)
    without touching either company's row, so both signals count."""
    if property_drifted:
        return True
    return bool(company_drift_by_company.get(company_id, False)) if company_id else False


def compute_drift(as_of: str, db_by_listing_id: dict, matched_ids) -> dict:
    """Runs every drift-group fetch and expands the result into
    {field_name: {listing_id: bool}}, one entry per FIELD_SPECS field, ready
    for compare_matched_fields. matched_ids may be any iterable; db rows are
    looked up in db_by_listing_id for their `property_id`."""
    matched_ids = list(matched_ids)
    property_ids = {db_by_listing_id[lid]["property_id"] for lid in matched_ids}
    company_ids = {
        _norm_blank(db_by_listing_id[lid].get("company_id"))
        for lid in matched_ids
        if _norm_blank(db_by_listing_id[lid].get("company_id"))
    }

    listing_drift = fetch_listing_drift(as_of, matched_ids)
    context = fetch_property_context(as_of, property_ids)
    amenities_drift_by_property = fetch_amenities_drift(as_of, property_ids)
    company_drift_by_company = fetch_company_drift(as_of, company_ids)

    media_relevant_ids = set(property_ids)
    for pid in property_ids:
        parent = context.get(pid, {}).get("parent_property_id")
        if parent:
            media_relevant_ids.add(parent)
    photos_drift_by_id = fetch_photos_drift(as_of, media_relevant_ids)

    property_address_drift = {}
    community_drift = {}
    amenities_drift = {}
    photos_drift = {}
    company_drift = {}
    for lid in matched_ids:
        pid = db_by_listing_id[lid]["property_id"]
        ctx = context.get(pid, {})
        property_address_drift[lid] = bool(ctx.get("property_address", False))
        community_drift[lid] = bool(ctx.get("community", False))
        amenities_drift[lid] = bool(amenities_drift_by_property.get(pid, False))
        parent = ctx.get("parent_property_id")
        photos_drift[lid] = bool(photos_drift_by_id.get(pid, False)) or (
            bool(parent) and bool(photos_drift_by_id.get(parent, False))
        )
        cid = _norm_blank(db_by_listing_id[lid].get("company_id"))
        company_drift[lid] = company_row_drifted(
            cid, company_drift_by_company, property_address_drift[lid]
        )

    group_drift = {
        "listing": listing_drift,
        "property_address": property_address_drift,
        "community": community_drift,
        "amenities": amenities_drift,
        "photos": photos_drift,
        "company": company_drift,
    }
    return {field: group_drift[group] for field, group in FIELD_DRIFT_GROUP.items()}


MIN_NON_DRIFTED_ROWS = 200
MIN_NON_DRIFTED_SHARE = 0.25
# Fix round 3 (per-field vacuous pass): a field could previously pass with
# `rate_non_drifted = ... if non_drifted_count else 1.0` -- so a field where
# every compared row happened to be drifted (non_drifted_count == 0) reported
# a fabricated 100% and passed. The floor below is the larger of an absolute
# row count and a share of what was compared, so it scales with a small
# reconciliation run without letting a huge one get away with a
# proportionally tiny non-drifted sample. The live runs' smallest
# non-drifted share was Bozeman's property_address group at ~51% (6,592
# rows) -- this floor leaves that ample room while forbidding a pass built
# on a near-empty denominator.


def compare_matched_fields(
    pairs, drift: "dict | None" = None, thresholds=None, max_samples: int = 5
) -> dict:
    """pairs: iterable of (listing_id, export_row, db_row). export_row/db_row
    are plain dicts keyed by, respectively, export column names and the
    reader's emitted keys -- either full rows or the slim subset a caller
    chooses to keep (see _load_export's EXPORT_KEEP_COLUMNS).

    drift: {field_name: {listing_id: bool}} (see compute_drift). A listing
    missing from a field's dict, or drift=None entirely, defaults to
    NOT drifted -- the conservative default: unknown drift status still
    counts fully against the strict threshold, exactly as it did before
    drift-awareness existed, rather than silently exempting it.

    Per field, reports both `agreement_all` (informational) and
    `agreement_non_drifted` (what `ok`/threshold is judged against, per the
    controller's ruling), plus mismatch samples split drifted/non-drifted
    (a mismatch on a drifted row is not a failure signal; one on a
    non-drifted row still is).

    Fix round 2: for a "tolerance" field (latitude, longitude,
    top_down_community_count -- see TOLERANCE_FUNCS), `agreement_all`/
    `agreement_non_drifted` are the TOLERANCE rate (what `ok` is judged
    against, per this round's ruling), and two more keys,
    `exact_agreement_all`/`exact_agreement_non_drifted`, report the plain
    numeric-equality rate alongside it -- never hidden, never gating.
    top_down_community_count's entry also carries `diff_histogram`: a
    signed (db - export) bucket count over non-drifted EXACT mismatches
    (not gated by tolerance, so it shows the full shape of disagreement).

    Fix round 3: a field is NOT ok when non_drifted_count falls below
    max(MIN_NON_DRIFTED_ROWS, MIN_NON_DRIFTED_SHARE * compared) --
    `reason` is "insufficient_non_drifted" in that case, "below_threshold"
    when there's enough evidence but the rate misses the bar, and None when
    ok. A rate with a zero denominator is reported as None, not a
    fabricated 1.0 (this alone would also fail the floor check, since
    MIN_NON_DRIFTED_ROWS > 0)."""
    thresholds = FIELD_THRESHOLDS if thresholds is None else thresholds
    drift = drift or {}
    pairs = list(pairs)
    report = {}
    for field, (export_col, reader_key, comparator) in FIELD_SPECS.items():
        field_drift = drift.get(field, {})
        is_tolerance_field = comparator == "tolerance"
        compared = 0
        drifted_count = 0
        non_drifted_count = 0
        matches_all = 0
        matches_non_drifted = 0
        exact_matches_all = 0
        exact_matches_non_drifted = 0
        samples_drifted = []
        samples_non_drifted = []
        diff_histogram = Counter() if field == "top_down_community_count" else None
        for listing_id, export_row, db_row in pairs:
            export_val = export_row.get(export_col, "")
            db_val = db_row.get(reader_key, "")
            compared += 1
            is_drifted = bool(field_drift.get(listing_id, False))

            if is_tolerance_field:
                exact_match, is_match = tolerance_match(field, export_val, db_val)
            else:
                is_match = exact_match = _values_match(comparator, export_val, db_val)

            if is_match:
                matches_all += 1
            if exact_match:
                exact_matches_all += 1

            if is_drifted:
                drifted_count += 1
                if not is_match and len(samples_drifted) < max_samples:
                    samples_drifted.append(
                        {"listing_id": listing_id, "export": export_val, "db": db_val}
                    )
            else:
                non_drifted_count += 1
                if is_match:
                    matches_non_drifted += 1
                elif len(samples_non_drifted) < max_samples:
                    samples_non_drifted.append(
                        {"listing_id": listing_id, "export": export_val, "db": db_val}
                    )
                if exact_match:
                    exact_matches_non_drifted += 1
                elif diff_histogram is not None:
                    e_num = _to_number(export_val)
                    d_num = _to_number(db_val)
                    if e_num is not None and d_num is not None:
                        diff_histogram[community_count_diff_bucket(int(d_num - e_num))] += 1

        # Zero-denominator rates are reported as None, never a fabricated
        # 1.0 -- a report should never show 100% agreement on nothing.
        rate_all = (matches_all / compared) if compared else None
        rate_non_drifted = (
            (matches_non_drifted / non_drifted_count) if non_drifted_count else None
        )
        threshold = thresholds.get(field, 0.0)

        # A field passes on ALL rows when they clear the threshold without
        # setting any drifted row aside: drift can only excuse mismatches, so
        # when there are too few to matter it is irrelevant. This matters for
        # fields whose drift signal is noisy (company_table.last_update_time
        # is bumped by background jobs and flags ~80% of Kansas City rows).
        # Only a pass that RELIES on excluding drifted rows needs the
        # non-drifted evidence floor, so a near-empty non-drifted pool can
        # never carry a pass on its own.
        min_non_drifted_required = max(
            MIN_NON_DRIFTED_ROWS, MIN_NON_DRIFTED_SHARE * compared
        )
        insufficient_non_drifted = non_drifted_count < min_non_drifted_required
        passes_on_all_rows = (
            compared >= MIN_NON_DRIFTED_ROWS
            and rate_all is not None
            and rate_all >= threshold
        )
        if passes_on_all_rows:
            field_ok, reason, passed_on = True, None, "all_rows"
        elif insufficient_non_drifted:
            field_ok, reason, passed_on = False, "insufficient_non_drifted", None
        elif rate_non_drifted is not None and rate_non_drifted < threshold:
            field_ok, reason, passed_on = False, "below_threshold", None
        else:
            field_ok, reason, passed_on = True, None, "non_drifted"

        entry = {
            "compared": compared,
            "drifted": drifted_count,
            "non_drifted": non_drifted_count,
            "agreement_all": rate_all,
            "agreement_non_drifted": rate_non_drifted,
            "threshold": threshold,
            "min_non_drifted_required": min_non_drifted_required,
            "ok": field_ok,
            "reason": reason,
            "passed_on": passed_on,
            "mismatch_samples_non_drifted": samples_non_drifted,
            "mismatch_samples_drifted": samples_drifted,
        }
        if is_tolerance_field:
            entry["exact_agreement_all"] = (
                (exact_matches_all / compared) if compared else None
            )
            entry["exact_agreement_non_drifted"] = (
                (exact_matches_non_drifted / non_drifted_count)
                if non_drifted_count
                else None
            )
        if diff_histogram is not None:
            entry["diff_histogram"] = dict(diff_histogram)
        report[field] = entry
    return report


# ---------------------------------------------------------------------------
# export-only classification
# ---------------------------------------------------------------------------


def classify_export_only_row(listing_id, predicate_results):
    """predicate_results: {predicate_name: bool}, in POPULATION_PREDICATES
    order, for a listing_id found in the (unfiltered) database -- or None
    when the id was not found in the database at all.

    - None                          -> "not_in_db" (a real failure: the join
      the reader relies on lost this row entirely)
    - every predicate true          -> "in_population_but_missed" (a reader
      bug: the row passes every filter yet market_listings didn't yield it)
    - some predicate(s) false       -> "excluded:<name>[+<name>...]" (the
      population filter explains it; does not fail the gate)
    """
    if predicate_results is None:
        return "not_in_db"
    failing = [name for name, ok in predicate_results.items() if not ok]
    if not failing:
        return "in_population_but_missed"
    return "excluded:" + "+".join(failing)


def summarise_export_only_classifications(classifications) -> dict:
    """Aggregate per-row classifications into gate-relevant counts:
    classification_counts (exact strings), the two failure counts, the
    explained (excluded:*) count, and predicate_fail_counts (how many
    export-only rows each single predicate excluded, counting a
    multi-predicate row once per predicate it failed)."""
    classification_counts = Counter(classifications)
    predicate_fail_counts = Counter()
    for classification in classifications:
        if classification.startswith("excluded:"):
            for name in classification[len("excluded:") :].split("+"):
                predicate_fail_counts[name] += 1
    not_in_db_count = classification_counts.get("not_in_db", 0)
    missed_count = classification_counts.get("in_population_but_missed", 0)
    explained_count = sum(
        n for cls, n in classification_counts.items() if cls.startswith("excluded:")
    )
    return {
        "classification_counts": dict(classification_counts),
        "not_in_db_count": not_in_db_count,
        "in_population_but_missed_count": missed_count,
        "explained_count": explained_count,
        "predicate_fail_counts": dict(predicate_fail_counts),
    }


def export_only_ok(summary: dict) -> bool:
    """Rows explained by the population filter never fail the gate; a
    not_in_db or in_population_but_missed row always does."""
    return summary["not_in_db_count"] == 0 and summary["in_population_but_missed_count"] == 0


# ---------------------------------------------------------------------------
# db-only classification
# ---------------------------------------------------------------------------


def classify_db_only_row(creation_time, export_min: str, export_max: str) -> str:
    """before_export_history / after_export_asof / other (the unexplained
    gap -- field_mapping.md open question 3). Comparison is lexical on the
    'YYYY-MM-DD HH24:MI:SS' string form both sides share, which sorts the
    same as chronological order. A blank creation_time (shouldn't happen in
    the filtered population, but never crash on it) can't be dated, so it
    falls into "other"."""
    ct = _norm_blank(creation_time)
    if not ct:
        return "other"
    if export_min and ct < export_min:
        return "before_export_history"
    if export_max and ct > export_max:
        return "after_export_asof"
    return "other"


def classify_db_only_rows(
    db_only_ids, db_by_listing_id: dict, export_min: str, export_max: str, export_company_ids: set
) -> dict:
    buckets = Counter()
    other_address1_ids = set()
    other_company_ids = set()
    other_company_in_export = 0
    other_total = 0
    for lid in db_only_ids:
        row = db_by_listing_id[lid]
        bucket = classify_db_only_row(row.get("creation_time", ""), export_min, export_max)
        buckets[bucket] += 1
        if bucket == "other":
            other_total += 1
            addr1 = _norm_blank(row.get("address1_id"))
            if addr1:
                other_address1_ids.add(addr1)
            cid = _norm_blank(row.get("company_id"))
            if cid:
                other_company_ids.add(cid)
                if cid in export_company_ids:
                    other_company_in_export += 1
    return {
        "buckets": dict(buckets),
        "other_distinct_address1_ids": len(other_address1_ids),
        "other_distinct_companies": len(other_company_ids),
        "other_company_in_export_share": (
            other_company_in_export / other_total if other_total else None
        ),
    }


# ---------------------------------------------------------------------------
# Diagnostic query (export-only classification against a live database)
# ---------------------------------------------------------------------------

DIAGNOSTIC_CHUNK = 2000


def _diagnostic_sql() -> str:
    """One boolean column per population predicate, over the UNFILTERED base
    join, restricted to a chunk of listing ids. Reuses BASE_FROM and
    POPULATION_PREDICATES verbatim from dwellsy_source, so the predicates
    evaluated here can never drift from the ones market_listings applies."""
    import dwellsy_source

    columns = ",\n       ".join(
        f"coalesce(({sql.strip()}), false) as {name}"
        for name, sql in dwellsy_source.POPULATION_PREDICATES
    )
    return (
        "select l.id::text as listing_id,\n       "
        + columns
        + "\n"
        + dwellsy_source.BASE_FROM
        + "where l.id = any(%(ids)s::bigint[])"
    )


def diagnose_export_only(msa_code: str, export_only_ids) -> dict:
    """{listing_id: {predicate_name: bool}} for every export-only id found in
    the (unfiltered) database at all. An id absent from the returned dict was
    not found in the database under ANY predicate state -- `not_in_db`."""
    import dwellsy_db
    import dwellsy_source

    ids = sorted(int(x) for x in export_only_ids)
    if not ids:
        return {}
    predicate_names = [name for name, _ in dwellsy_source.POPULATION_PREDICATES]
    sql = _diagnostic_sql()
    results: dict[str, dict] = {}
    for i in range(0, len(ids), DIAGNOSTIC_CHUNK):
        chunk = ids[i : i + DIAGNOSTIC_CHUNK]
        for row in dwellsy_db.query(sql, {"ids": chunk, "msa_code": msa_code}):
            results[row["listing_id"]] = {name: bool(row[name]) for name in predicate_names}
    return results


def classify_export_only(msa_code: str, export_only_ids, max_samples: int = 10) -> dict:
    """Runs the diagnostic query and classifies every export-only id.
    Returns the summarise_export_only_classifications() roll-up plus
    coarse-grouped samples (listing_id + failing predicates) for reporting."""
    diagnostics = diagnose_export_only(msa_code, export_only_ids)
    classifications = []
    samples: dict[str, list] = defaultdict(list)
    for lid in sorted(export_only_ids, key=lambda x: int(x)):
        predicate_results = diagnostics.get(lid)
        classification = classify_export_only_row(lid, predicate_results)
        classifications.append(classification)
        if classification == "not_in_db":
            group = "not_in_db"
            failing: list = []
        elif classification == "in_population_but_missed":
            group = "in_population_but_missed"
            failing = []
        else:
            group = "excluded"
            failing = classification[len("excluded:") :].split("+")
        if len(samples[group]) < max_samples:
            samples[group].append({"listing_id": lid, "failing_predicates": failing})
    summary = summarise_export_only_classifications(classifications)
    summary["samples"] = dict(samples)
    return summary


# ---------------------------------------------------------------------------
# Export CSV loading
# ---------------------------------------------------------------------------

# Only the columns field-parity and db-only characterisation need -- keeps
# per-row memory bounded on the 357MB Kansas City export.
EXPORT_KEEP_COLUMNS = tuple(
    sorted({export_col for export_col, _, _ in FIELD_SPECS.values()} | {"listing_id", "msa_code"})
)


def _is_malformed(listing_id: str, row_msa: str, msa_code: str) -> bool:
    """The known upstream description-quoting bug (unquoted commas or an
    unquoted embedded newline in `description` shift every later column, or
    -- when the shift crosses a row boundary -- spill description text into
    what looks like a brand-new row starting at column 0). Either way the
    row is unusable: detect it the same way repair_export_quoting.py does,
    by a structural check on columns that must otherwise be well-formed
    (listing_id numeric, msa_code the requested market), not by a naive line
    count (records legitimately carry embedded newlines when properly
    quoted)."""
    return not listing_id.isdigit() or row_msa != msa_code


def _load_export(csv_path: str, msa_code: str):
    """Streams the export CSV (never fully materialized: csv.DictReader is
    itself a generator over the file). Returns:
      export_by_listing_id: {listing_id: slim row dict}
      malformed_count: rows dropped as unparseable (see _is_malformed)
      creation_min, creation_max: the export's own creation_time bounds
        (strings, 'YYYY-MM-DD HH24:MI:SS' -- sortable lexically), used to
        bucket db-only rows
      company_ids_seen: every non-blank child_company_id in the export,
        for the db-only "other" bucket's company-overlap share
    """
    export_by_listing_id: dict[str, dict] = {}
    malformed_count = 0
    creation_min = creation_max = None
    company_ids_seen: set = set()
    with open(csv_path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            listing_id = (row.get("listing_id") or "").strip()
            row_msa = (row.get("msa_code") or "").strip()
            if _is_malformed(listing_id, row_msa, msa_code):
                malformed_count += 1
                continue
            slim = {col: row.get(col, "") for col in EXPORT_KEEP_COLUMNS}
            export_by_listing_id[listing_id] = slim
            ct = _norm_blank(slim.get("creation_time"))
            if ct:
                if creation_min is None or ct < creation_min:
                    creation_min = ct
                if creation_max is None or ct > creation_max:
                    creation_max = ct
            cid = _norm_blank(slim.get("child_company_id"))
            if cid:
                company_ids_seen.add(cid)
    return export_by_listing_id, malformed_count, creation_min, creation_max, company_ids_seen


def _load_db(msa_code: str) -> dict:
    import dwellsy_source

    db_by_listing_id = {}
    for row in dwellsy_source.market_listings(msa_code):
        lid = listing_key(row)
        if lid:
            db_by_listing_id[lid] = row
    return db_by_listing_id


# ---------------------------------------------------------------------------
# Top-level gate (Fix round 3)
#
# The pre-fix `ok = export_only_ok(...) and not fields_below_threshold` had
# no floor: an empty export CSV, or a wrong msa argument that makes
# _is_malformed (see above) reject every row, yields zero matched rows.
# Every field then reports compared=0, non_drifted=0 and (pre-fix) a
# fabricated rate of 1.0 -- every field "ok", export_only_ok trivially true
# on an empty export-only set, and the gate exits 0 having reconciled
# nothing at all. These three conditions close that hole; each is reported
# by name in `gate_failures` so a failing run says WHY, not just that it
# failed.
# ---------------------------------------------------------------------------

MAX_MALFORMED_SHARE = 0.01
# A wrong msa argument makes _is_malformed reject every row (row_msa can
# never equal the requested market), which would otherwise masquerade as
# "just some corrupt rows". The known upstream description-quoting bug that
# malformed-row detection actually exists for has historically corrupted far
# fewer than 1% of rows (field_mapping.md) -- so a share above 1% is itself
# a signal the input (or the msa argument) is wrong, not ordinary export
# corruption.

MAX_EXPLAINED_SHARE = 0.01
# export_only_ok() never fails the gate on an "excluded:*" row -- that's the
# point of classifying it as explained. But a mistranslated population
# predicate (a boolean flipped, an operator swapped) would ALSO explain away
# real export rows it wrongly excludes, and would still pass export_only_ok
# no matter how many rows it silently drops, as long as some predicate comes
# back false for each one. This cap catches that: measured 0.04% in Bozeman
# and 0.27% in Kansas City, so a share above 1% of well-formed export rows
# is itself a signal a predicate is mistranslated, not ordinary population
# filtering.

CAVEATS = [
    "amenities/amenities_string: property_amenity_table has no delete-audit "
    "table (unlike photos' deleted_property_media_table), so a property "
    "whose amenities were entirely removed after as_of is invisible to the "
    "drift check and is scored as non-drifted -- their non-drifted "
    "agreement rate is a slight under-estimate of true agreement on rows "
    "that really didn't change.",
]


def compute_gate_failures(
    *,
    export_rows: int,
    malformed_export_rows: int,
    matched_rows: int,
    explained_export_only_rows: int = 0,
) -> list:
    """Named top-level gate conditions, each of which alone makes `ok`
    False:
      - no_export_rows: zero well-formed export rows -- nothing to reconcile.
      - no_matched_rows: zero matched listing_ids -- the export and the
        database share no rows under the reconciliation key at all.
      - malformed_share_exceeded: malformed_export_rows is more than
        MAX_MALFORMED_SHARE of (well-formed + malformed) -- the export (or
        the msa argument) is wrong, not just ordinarily noisy.
      - explained_share_exceeded: explained_export_only_rows (the
        "excluded:*" rows export_only_ok never fails on) is more than
        MAX_EXPLAINED_SHARE of export_rows -- see MAX_EXPLAINED_SHARE's own
        comment for why an uncapped "explained" bucket can hide a real bug.
    Returns the list of names that fired, in that order; empty when none
    did. Division is guarded: a totally empty export (both counts zero)
    reports no_export_rows/no_matched_rows without also dividing by zero."""
    failures = []
    if export_rows == 0:
        failures.append("no_export_rows")
    if matched_rows == 0:
        failures.append("no_matched_rows")
    total_rows = export_rows + malformed_export_rows
    if total_rows and (malformed_export_rows / total_rows) > MAX_MALFORMED_SHARE:
        failures.append("malformed_share_exceeded")
    if export_rows and (explained_export_only_rows / export_rows) > MAX_EXPLAINED_SHARE:
        failures.append("explained_share_exceeded")
    return failures


# ---------------------------------------------------------------------------
# Top-level composition
# ---------------------------------------------------------------------------


def _compose_result(
    *,
    msa_code,
    as_of="",
    export_rows,
    malformed_export_rows,
    db_rows,
    matched_ids,
    export_only_summary,
    db_only_detail,
    db_only_count,
    export_only_count,
    field_report,
) -> dict:
    fields_below_threshold = [f for f, r in field_report.items() if not r["ok"]]
    gate_failures = compute_gate_failures(
        export_rows=export_rows,
        malformed_export_rows=malformed_export_rows,
        matched_rows=len(matched_ids),
        explained_export_only_rows=export_only_summary.get("explained_count", 0),
    )
    ok = (
        not gate_failures
        and export_only_ok(export_only_summary)
        and not fields_below_threshold
    )
    return {
        "msa_code": msa_code,
        "as_of": as_of,
        "export_rows": export_rows,
        "malformed_export_rows": malformed_export_rows,
        "db_rows": db_rows,
        "matched": len(matched_ids),
        "gate_failures": gate_failures,
        "export_only": export_only_count,
        "export_only_detail": export_only_summary,
        "db_only": db_only_count,
        "db_only_detail": db_only_detail,
        "fields": field_report,
        "fields_below_threshold": fields_below_threshold,
        "not_yet_emitted": list(NOT_YET_EMITTED),
        "caveats": list(CAVEATS),
        "ok": ok,
    }


def reconcile(msa_code: str, csv_path: str, as_of: "str | None" = None) -> dict:
    as_of = parse_as_of(csv_path, as_of)

    (
        export_by_id,
        malformed_count,
        export_min,
        export_max,
        export_company_ids,
    ) = _load_export(csv_path, msa_code)

    if not export_by_id:
        # Zero well-formed export rows -- no_export_rows (and, when
        # malformed_count > 0, likely malformed_share_exceeded too, e.g. a
        # wrong msa argument that makes _is_malformed reject every row) will
        # fail the gate no matter what the database holds. Short-circuit
        # before the DB pull: it's cheaper, and a `db_rows`/`matched` count
        # pulled against a CSV that describes nothing would only confuse the
        # summary.
        field_report = compare_matched_fields([])
        return _compose_result(
            msa_code=msa_code,
            as_of=as_of,
            export_rows=0,
            malformed_export_rows=malformed_count,
            db_rows=0,
            matched_ids=set(),
            export_only_summary=summarise_export_only_classifications([]),
            db_only_detail={
                "buckets": {},
                "other_distinct_address1_ids": 0,
                "other_distinct_companies": 0,
                "other_company_in_export_share": None,
            },
            db_only_count=0,
            export_only_count=0,
            field_report=field_report,
        )

    db_by_id = _load_db(msa_code)

    export_keys = set(export_by_id)
    db_keys = set(db_by_id)

    matched_ids = export_keys & db_keys
    export_only_ids = export_keys - db_keys
    db_only_ids = db_keys - export_keys

    export_only_summary = classify_export_only(msa_code, export_only_ids)
    db_only_detail = classify_db_only_rows(
        db_only_ids, db_by_id, export_min or "", export_max or "", export_company_ids
    )

    pairs = [(lid, export_by_id[lid], db_by_id[lid]) for lid in matched_ids]
    drift = compute_drift(as_of, db_by_id, matched_ids)
    field_report = compare_matched_fields(pairs, drift=drift)

    return _compose_result(
        msa_code=msa_code,
        as_of=as_of,
        export_rows=len(export_by_id),
        malformed_export_rows=malformed_count,
        db_rows=len(db_by_id),
        matched_ids=matched_ids,
        export_only_summary=export_only_summary,
        db_only_detail=db_only_detail,
        db_only_count=len(db_only_ids),
        export_only_count=len(export_only_ids),
        field_report=field_report,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _fmt_rate(rate) -> str:
    """A None rate (zero denominator) prints as 'n/a', never a fabricated
    percentage."""
    return f"{rate * 100:6.2f}%" if rate is not None else "   n/a"


def _print_summary(result: dict) -> None:
    print(f"market {result['msa_code']}  as_of {result.get('as_of', '')}")
    for key in ("export_rows", "malformed_export_rows", "db_rows", "matched", "export_only", "db_only"):
        print(f"  {key:26s} {result[key]:,}")

    gate_failures = result.get("gate_failures") or []
    print(f"  gate_failures: {', '.join(gate_failures) if gate_failures else 'none'}")

    eo = result["export_only_detail"]
    print("  export-only classification:")
    for cls, n in sorted(eo["classification_counts"].items(), key=lambda kv: -kv[1]):
        print(f"    {cls:40s} {n:,}")
    if eo["predicate_fail_counts"]:
        print("  export-only excluded by predicate (rows may fail more than one):")
        for name, n in sorted(eo["predicate_fail_counts"].items(), key=lambda kv: -kv[1]):
            print(f"    {name:24s} {n:,}")
    for group, samples in eo.get("samples", {}).items():
        if samples:
            print(f"  sample {group}:")
            for s in samples[:10]:
                print(f"    listing_id={s['listing_id']} failing={s['failing_predicates']}")

    do = result["db_only_detail"]
    print("  db-only buckets:")
    for bucket, n in sorted(do["buckets"].items()):
        print(f"    {bucket:26s} {n:,}")
    print(
        f"    other: distinct address1_ids={do['other_distinct_address1_ids']:,} "
        f"distinct companies={do['other_distinct_companies']:,} "
        f"company_in_export_share={do['other_company_in_export_share']}"
    )

    print("  field agreement (passes on the all-rows rate, else on the non-drifted rate; tolerance rate where noted):")
    for field, r in result["fields"].items():
        flag = "OK" if r["ok"] else "FAIL"
        rate_label = "tolerance_non_drifted" if "exact_agreement_non_drifted" in r else "non_drifted"
        reason_suffix = f" reason={r['reason']}" if r.get("reason") else ""
        if r.get("passed_on"):
            reason_suffix += f" passed_on={r['passed_on']}"
        print(
            f"    {field:26s} {rate_label}={_fmt_rate(r['agreement_non_drifted'])} "
            f"(n={r['non_drifted']:,}) all={_fmt_rate(r['agreement_all'])} "
            f"(n={r['compared']:,}, drifted={r['drifted']:,}) "
            f"threshold={r['threshold']*100:.0f}% [{flag}]{reason_suffix}"
        )
        if "exact_agreement_non_drifted" in r:
            print(
                f"      {'':26s} exact_non_drifted={_fmt_rate(r['exact_agreement_non_drifted'])} "
                f"exact_all={_fmt_rate(r['exact_agreement_all'])}"
            )
        if "diff_histogram" in r:
            hist = ", ".join(
                f"{b}:{r['diff_histogram'].get(b, 0):,}" for b in COMMUNITY_COUNT_DIFF_BUCKETS
            )
            print(f"      {'':26s} diff_histogram(db-export, non-drifted mismatches): {hist}")
        if not r["ok"]:
            for s in r["mismatch_samples_non_drifted"]:
                print(
                    f"       mismatch(non-drifted) listing_id={s['listing_id']} "
                    f"export={s['export']!r} db={s['db']!r}"
                )
            for s in r["mismatch_samples_drifted"][:2]:
                print(
                    f"       mismatch(drifted, informational) listing_id={s['listing_id']} "
                    f"export={s['export']!r} db={s['db']!r}"
                )

    if result["not_yet_emitted"]:
        print(f"  not yet emitted: {', '.join(result['not_yet_emitted'])}")

    caveats = result.get("caveats") or []
    if caveats:
        print("  caveats:")
        for c in caveats:
            print(f"    - {c}")

    print("OK — database is a superset of the export" if result["ok"] else "BLOCKED")


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("msa_code")
    parser.add_argument("csv_path")
    parser.add_argument(
        "--as-of", default=None,
        help="Export as-of date (YYYY-MM-DD). Derived from the CSV filename when omitted.",
    )
    parser.add_argument(
        "--json", dest="json_out", default=None,
        help="Write the full result as JSON to this path.",
    )
    return parser


def main(argv) -> int:
    args = _build_arg_parser().parse_args(argv)

    result = reconcile(args.msa_code, args.csv_path, as_of=args.as_of)
    _print_summary(result)

    if args.json_out:
        with open(args.json_out, "w") as fh:
            json.dump(result, fh, indent=2, default=str)

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
