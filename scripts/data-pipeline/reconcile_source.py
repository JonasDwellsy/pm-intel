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
import csv
import json
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
# Field-level parity on matched rows
#
# field name -> (export column, reader-emitted key, comparator). Most fields
# share one name on both sides; two don't:
#   - "company_id" (reader) == "child_company_id" (export): field_mapping.md
#     -- `c.id` (= `p.company_id`) VERIFIED 1000/1000 + 12,935/12,935
#     whole-export against `child_company_id`. The reader does not (yet)
#     emit a key literally named `child_company_id`, but it DOES emit the
#     equivalent value under `company_id` (module docstring: "`company_id`
#     (the join key Task 6 needs) ... [is] emitted here"). Comparing it here,
#     rather than folding it into NOT_YET_EMITTED, is a judgment call --
#     see task-5-report.md.
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
    "latitude":                   ("latitude",                  "latitude",                  "numeric"),
    "longitude":                  ("longitude",                 "longitude",                 "numeric"),
    "company_id":                 ("child_company_id",          "company_id",                "exact"),
    "rent_amount":                ("rent_amount",               "rent_amount",               "numeric"),
    "description":                ("description",               "description",               "exact"),
    "creation_time":               ("creation_time",             "creation_time",             "exact"),
    "deactivation_time":           ("deactivation_time",         "deactivation_time",         "exact"),
    "property_listing_status":     ("property_listing_status",   "property_listing_status",   "exact"),
    "top_down_community_count":    ("top_down_community_count",  "top_down_community_count",  "numeric"),
    "amenities":                   ("amenities",                 "amenities",                 "count"),
    "amenities_string":            ("amenities",                 "amenities",                 "exact"),
    "photos":                      ("photos",                    "photos",                    "count"),
}

# Task 6 fields: operator identity, arriving with the parent-company join.
# child_company_id is listed here per the controller's ruling, but is already
# available today via the reader's `company_id` key (see FIELD_SPECS above
# and task-5-report.md's "Judgment calls") -- it is compared, not skipped.
NOT_YET_EMITTED = (
    "company_name",
    "child_company_type",
    "parent_company_id",
    "parent_company_name",
    "parent_company_type",
)

# Thresholds = field_mapping.md's measured agreement rate (2026-09-26,
# Bozeman n=1000 unless noted) minus a margin for drift between that probe
# and whenever this gate runs. Two anchor points, given in the task: a field
# measured at 1.0 gets margin 0.01 (threshold >= 0.99); a field measured at
# ~0.97 gets margin ~0.04 (threshold >= 0.93, the photos-count case below,
# verbatim). Margin widens as the measured rate drops, since a field that
# already disagrees more often has more room for further live drift.
FIELD_THRESHOLDS: dict[str, float] = {
    "uru_id": 0.99,                    # measured 100.0% (1000/1000)
    "community_id": 0.99,               # measured 100.0% (1000/1000)
    "address1_id": 0.99,                # measured 100.0% (1000/1000)
    "address_1": 0.99,                  # measured 100.0% (1000/1000)
    "address_city": 0.99,               # measured 100.0% (1000/1000)
    "address_type": 0.99,               # measured 100.0% (1000/1000)
    "bedrooms": 0.99,                   # measured 100.0% (coalesce form, 1000/1000)
    "latitude": 0.99,                   # measured 100.0% (1000/1000)
    "longitude": 0.99,                  # measured 100.0% (1000/1000)
    "company_id": 0.99,                 # measured 100.0% (child_company_id: 1000/1000 + 12,935/12,935 whole-export)
    "rent_amount": 0.99,                # measured 99.9% (999/1000; the 1 miss was rewritten after the pull)
    "creation_time": 0.99,               # measured 100.0% (1000/1000)
    "top_down_community_count": 0.99,   # measured 100.0% (1000/1000)
    "description": 0.98,                # measured 99.6% (996/1000)
    "deactivation_time": 0.97,          # measured 99.2% (992/1000; misses are post-pull closures)
    "property_listing_status": 0.97,    # measured 99.2% (992/1000; misses are post-pull state changes)
    "amenities": 0.95,                  # measured 98.7% by count (987/1000)
    "amenities_string": 0.95,           # measured 98.6% exact string (986/1000)
    "photos": 0.93,                     # measured 96.9% by count (969/1000) -- the task's own worked example
}


def compare_matched_fields(pairs, thresholds=None, max_samples: int = 5) -> dict:
    """pairs: iterable of (listing_id, export_row, db_row). export_row/db_row
    are plain dicts keyed by, respectively, export column names and the
    reader's emitted keys -- either full rows or the slim subset a caller
    chooses to keep (see _load_export's EXPORT_KEEP_COLUMNS)."""
    thresholds = FIELD_THRESHOLDS if thresholds is None else thresholds
    pairs = list(pairs)
    report = {}
    for field, (export_col, reader_key, comparator) in FIELD_SPECS.items():
        compared = 0
        matches = 0
        samples = []
        for listing_id, export_row, db_row in pairs:
            export_val = export_row.get(export_col, "")
            db_val = db_row.get(reader_key, "")
            compared += 1
            if _values_match(comparator, export_val, db_val):
                matches += 1
            elif len(samples) < max_samples:
                samples.append(
                    {"listing_id": listing_id, "export": export_val, "db": db_val}
                )
        rate = (matches / compared) if compared else 1.0
        threshold = thresholds.get(field, 0.0)
        report[field] = {
            "compared": compared,
            "matches": matches,
            "agreement": rate,
            "threshold": threshold,
            "ok": rate >= threshold,
            "mismatch_samples": samples,
        }
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
# Top-level composition
# ---------------------------------------------------------------------------


def _compose_result(
    *,
    msa_code,
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
    ok = export_only_ok(export_only_summary) and not fields_below_threshold
    return {
        "msa_code": msa_code,
        "export_rows": export_rows,
        "malformed_export_rows": malformed_export_rows,
        "db_rows": db_rows,
        "matched": len(matched_ids),
        "export_only": export_only_count,
        "export_only_detail": export_only_summary,
        "db_only": db_only_count,
        "db_only_detail": db_only_detail,
        "fields": field_report,
        "fields_below_threshold": fields_below_threshold,
        "not_yet_emitted": list(NOT_YET_EMITTED),
        "ok": ok,
    }


def reconcile(msa_code: str, csv_path: str) -> dict:
    (
        export_by_id,
        malformed_count,
        export_min,
        export_max,
        export_company_ids,
    ) = _load_export(csv_path, msa_code)
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
    field_report = compare_matched_fields(pairs)

    return _compose_result(
        msa_code=msa_code,
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


def _print_summary(result: dict) -> None:
    print(f"market {result['msa_code']}")
    for key in ("export_rows", "malformed_export_rows", "db_rows", "matched", "export_only", "db_only"):
        print(f"  {key:26s} {result[key]:,}")

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

    print("  field agreement:")
    for field, r in result["fields"].items():
        flag = "OK" if r["ok"] else "FAIL"
        print(
            f"    {field:26s} {r['agreement']*100:6.2f}% (n={r['compared']:,}) "
            f"threshold={r['threshold']*100:.0f}% [{flag}]"
        )
        if not r["ok"]:
            for s in r["mismatch_samples"]:
                print(f"       mismatch listing_id={s['listing_id']} export={s['export']!r} db={s['db']!r}")

    print(f"  not yet emitted (Task 6): {', '.join(result['not_yet_emitted'])}")
    print("OK — database is a superset of the export" if result["ok"] else "BLOCKED")


def main(argv) -> int:
    msa_code = argv[0]
    csv_path = argv[1]
    json_out = None
    if "--json" in argv:
        json_out = argv[argv.index("--json") + 1]

    result = reconcile(msa_code, csv_path)
    _print_summary(result)

    if json_out:
        with open(json_out, "w") as fh:
            json.dump(result, fh, indent=2, default=str)

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
