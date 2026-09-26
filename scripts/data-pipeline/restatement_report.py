"""Per-market before/after for the CSV -> database cutover (Task 8).

Compares a market's per-market scorecard JSON produced with `pipeline.py
--source csv` against the same market run with `--source db`, at the SAME
`--as-of`, so the comparison isolates the source swap from any calendar
drift (see docs/superpowers/specs/2026-09-26-dwellsy-db-source-migration-
design.md, "Output invariants" + "Amendments").

HARD RULE: this never reads or reports a `rank` field (`rank.composite`,
`rank.compositeStar`, `rank.overall`, `rank.overallTotal`,
`rank.percentiles.*`). Operator IQ's product rule is that a scorecard never
surfaces rank or composite; this report is internal (goes in the cutover
PR), but follows the same rule so nothing here can be pasted onto a
customer-facing surface unedited. Metric VALUES (DOM, rent YoY, retention,
the marketing sub-composite) and star ratings are fine -- only the ranked-
standing fields are off limits. See METRICS below for the full allowlist.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
import statistics
from typing import Optional

# pipeline.py's ELIG_T12_MIN -- operators below this trailing-12-month
# listing count are not ranked/scored (not in `pms[]`).
ELIGIBILITY_MIN_T12 = 30

STAR_RANK = {"gold": 3, "silver": 2, "bronze": 1, None: 0}

# (json group, value field, star field, display label, value formatter)
METRICS = [
    ("performance", "domT12", "domStar", "DOM (T12 median, days)", lambda v: f"{v:.1f}"),
    ("rentPerformance", "pmYoyChange", "star", "Rent YoY change", lambda v: f"{v * 100:+.1f}%"),
    ("tenancy", "retention18Pct", "star", "18-mo retention", lambda v: f"{v:.1f}%"),
    ("marketing", "compositeScore", "star", "Marketing composite", lambda v: f"{v:.1f}"),
]


def _load(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _index(doc: dict) -> dict:
    return {p["slug"]: p for p in doc.get("pms", [])}


def _get(pm: dict, group: str, field: str):
    block = pm.get(group) or {}
    return block.get(field)


def _market_summary(doc: dict) -> dict:
    """The top-level `markets[0]` block: market-wide aggregates the pipeline
    already computed (distinct T12 urus, operator counts by tier, etc.).
    Absent or malformed in a fixture -> {} so callers degrade gracefully."""
    markets = doc.get("markets") or []
    return markets[0] if markets else {}


def _summary_md_path(json_path: str) -> str:
    base, _ = os.path.splitext(json_path)
    return base + "_Summary.md"


def _parse_summary_counts(json_path: str) -> dict:
    """Best-effort scrape of the sibling `_Summary.md` (pipeline.py writes
    one next to every JSON output) for the one figure neither JSON carries:
    the raw row count fed to the pipeline ("BHM rows in CSV: **N**", the
    line's name is legacy and unconditional -- it prints under --source db
    too). Returns {} if the file is missing or the line isn't found; every
    key is optional to callers."""
    path = _summary_md_path(json_path)
    out: dict = {}
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return out
    m = re.search(r"BHM rows in CSV:\s*\*\*([\d,]+)\*\*", text)
    if m:
        out["input_rows"] = int(m.group(1).replace(",", ""))
    return out


def _load_json_or_none(path: str) -> Optional[dict]:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def _db_snapshot_info(db_json_path: str, msa_code: Optional[str] = None) -> dict:
    """Best-effort: db_snapshot.py writes `db_snapshot_<slug>_<date>.csv` + a
    `.meta.json` sidecar next to the run's JSON output. If one is found
    here, read its `row_count`, its `reader_stats` (the has_uru exclusion
    counts -- see the module docstring), and compute a live uru-id coverage
    percentage from the snapshot itself. Returns {} when nothing is found --
    e.g. every unit test here, which uses fabricated JSON with no snapshot
    file alongside it.

    `msa_code`, when given, picks the meta whose OWN `msa_code` matches --
    a directory can hold snapshots for more than one market (e.g. a shared
    OUT_DIR across several runs), and the lexically-last filename has no
    relationship to which one is THIS market's. Falls back to the
    lexically-last meta when msa_code isn't given, or none matches, so
    callers that can't supply it keep the old behavior."""
    out: dict = {}
    directory = os.path.dirname(os.path.abspath(db_json_path))
    metas = sorted(glob.glob(os.path.join(directory, "db_snapshot_*.csv.meta.json")))
    if not metas:
        return out
    meta_path = None
    meta = None
    if msa_code:
        for candidate_path in metas:
            candidate_meta = _load_json_or_none(candidate_path)
            if candidate_meta is not None and str(candidate_meta.get("msa_code")) == str(msa_code):
                meta_path, meta = candidate_path, candidate_meta
                break
    if meta is None:
        meta_path = metas[-1]
        meta = _load_json_or_none(meta_path)
        if meta is None:
            return out
    out["row_count"] = meta.get("row_count")
    reader_stats = meta.get("reader_stats") or {}
    out["rows_passing_other_predicates"] = reader_stats.get("rows_passing_other_predicates")
    out["rows_excluded_only_by_has_uru"] = reader_stats.get("rows_excluded_only_by_has_uru")
    snapshot_csv = meta_path[: -len(".meta.json")]
    try:
        total = 0
        blank = 0
        with open(snapshot_csv, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                total += 1
                if not (row.get("uru_id") or "").strip():
                    blank += 1
        if total:
            out["uru_coverage_pct"] = round(100 * (total - blank) / total, 4)
    except OSError:
        pass
    return out


def _match_elsewhere(pm: dict, other_index: dict) -> Optional[str]:
    """Does this operator's identity (companyId / parentCompanyId /
    canonicalOperatorId) show up on some OTHER slug in `other_index`? If so
    it didn't vanish -- it was re-keyed (a rename or a merge decision), and
    that slug is returned. Used to tell a genuine loss apart from a slug
    change before flagging a lost operator UNEXPLAINED."""
    ids = {pm.get("companyId"), pm.get("parentCompanyId"), pm.get("canonicalOperatorId")}
    ids.discard(None)
    if not ids:
        return None
    for slug, other in other_index.items():
        if slug == pm.get("slug"):
            continue
        other_ids = {other.get("companyId"), other.get("parentCompanyId"), other.get("canonicalOperatorId")}
        if ids & other_ids:
            return slug
    return None


def _fmt(n) -> str:
    if n is None:
        return "n/a"
    if isinstance(n, float):
        return f"{n:,.1f}" if n == n else "n/a"  # NaN guard
    return f"{n:,}"


def _fmt_pct(v) -> str:
    """2-decimal formatter for uru-coverage percentages specifically: a
    coverage of 99.97% rounds to "100.0%" at 1 decimal (`_fmt`'s precision),
    which erases exactly the gap this figure exists to show."""
    if v is None:
        return "n/a"
    return f"{v:.2f}%"


def _pct_delta(before, after) -> str:
    if before is None or after is None:
        return "n/a"
    delta = after - before
    return f"{delta:+,}"


# The reader's own OUTPUT is 100% uru_id coverage by construction (has_uru is
# one of its own population predicates -- see dwellsy_source.py), so that can
# never fail and was never a meaningful invariant. What can fail is how much
# of the would-be population is dropped for lacking a URU at all: this is
# the same 1% ceiling dwellsy_source's own test applies to LAST_RUN_STATS.
MAX_URU_DROP_SHARE = 0.01


def _uru_drop_invariant(counts_facts: dict) -> tuple[str, str]:
    """(label, verdict) for the invariant-checklist row -- label carries the
    actual count and share inline, per its own instruction, rather than a
    bare pass/fail with the numbers hidden in the Counts table."""
    passing = counts_facts.get("rows_passing_other_predicates")
    excluded = counts_facts.get("rows_excluded_only_by_has_uru")
    if not passing:
        return "Rows dropped only for a missing URU: n/a", "n/a"
    share = (excluded or 0) / passing
    label = f"Rows dropped only for a missing URU: {excluded:,} ({share * 100:.2f}%)"
    verdict = "PASS" if share <= MAX_URU_DROP_SHARE else "FAIL"
    return label, verdict


def _counts_section(a: dict, b: dict, csv_json_path: str, db_json_path: str,
                     csv_snapshot_meta: Optional[dict], ap: dict, bp: dict) -> list[str]:
    am = _market_summary(a)
    bm = _market_summary(b)
    csv_extra = dict(csv_snapshot_meta or {})
    csv_summary = _parse_summary_counts(csv_json_path)
    db_summary = _parse_summary_counts(db_json_path)
    db_extra = _db_snapshot_info(db_json_path, msa_code=bm.get("msaCode"))

    csv_rows = csv_summary.get("input_rows", csv_extra.get("input_rows"))
    db_rows = db_summary.get("input_rows", db_extra.get("row_count"))
    csv_uru_cov = csv_extra.get("uru_coverage_pct")
    db_uru_cov = db_extra.get("uru_coverage_pct")

    rows_delta = "n/a"
    if csv_rows is not None and db_rows is not None:
        rows_delta = f"{db_rows - csv_rows:+,}"

    lines = [
        "| | csv | db | delta |",
        "|---|---|---|---|",
        f"| Input rows (this MSA) | {_fmt(csv_rows)} | {_fmt(db_rows)} | {rows_delta} |",
        f"| Distinct URUs (T12, market-wide) | {_fmt(am.get('msaIndexUrus'))} | "
        f"{_fmt(bm.get('msaIndexUrus'))} | {_pct_delta(am.get('msaIndexUrus'), bm.get('msaIndexUrus'))} |",
        f"| Operators observed (T12 >=1) | {_fmt(am.get('operatorCountTotal'))} | "
        f"{_fmt(bm.get('operatorCountTotal'))} | "
        f"{_pct_delta(am.get('operatorCountTotal'), bm.get('operatorCountTotal'))} |",
        f"| Active operators (T12 >=3) | {_fmt(am.get('activeOperatorCount'))} | "
        f"{_fmt(bm.get('activeOperatorCount'))} | "
        f"{_pct_delta(am.get('activeOperatorCount'), bm.get('activeOperatorCount'))} |",
        f"| Operators scored (ranked+dormant, T12 >={ELIGIBILITY_MIN_T12}) | {len(ap)} | {len(bp)} | "
        f"{len(bp) - len(ap):+d} |",
        f"| uru_id coverage (non-blank share of input rows) | "
        f"{_fmt_pct(csv_uru_cov)} | {_fmt_pct(db_uru_cov)} | — |",
    ]
    if db_uru_cov is not None:
        lines += [
            "",
            "_db-side uru_id coverage is 100% by construction: "
            "`market_listings` filters on `has_uru` itself, so every row it "
            "emits already has a uru_id. See \"Rows dropped only for a "
            "missing URU\" in the invariant checklist below for what that "
            "filter actually costs._",
        ]
    return lines, {
        "csv_rows": csv_rows, "db_rows": db_rows,
        "csv_uru_cov": csv_uru_cov, "db_uru_cov": db_uru_cov,
        "rows_passing_other_predicates": db_extra.get("rows_passing_other_predicates"),
        "rows_excluded_only_by_has_uru": db_extra.get("rows_excluded_only_by_has_uru"),
    }


def _lost_section(lost: list, ap: dict, bp: dict, notes: Optional[dict]) -> tuple[list[str], bool]:
    notes = notes or {}
    if not lost:
        return ["- No operator lost scored status.", ""], True
    lines = [
        "| slug | name | csv T12 listings | csv data tier | verdict |",
        "|---|---|---|---|---|",
    ]
    all_explained = True
    for slug in lost:
        pm = ap[slug]
        t12 = _get(pm, "coverage", "t12Listings")
        tier = _get(pm, "coverage", "dataTier")
        renamed_to = _match_elsewhere(pm, bp)
        note = notes.get(slug)
        if renamed_to:
            verdict = f"EXPLAINED — present in db output as `{renamed_to}`"
        elif note:
            verdict = f"EXPLAINED — {note}"
        else:
            verdict = "**UNEXPLAINED — investigate before cutover**"
            all_explained = False
        lines.append(f"| {slug} | {pm.get('name')} | {_fmt(t12)} (min {ELIGIBILITY_MIN_T12}) | {tier} | {verdict} |")
    lines.append("")
    return lines, all_explained


def _gained_section(gained: list, bp: dict, top_n: int = 10) -> list[str]:
    if not gained:
        return ["- No newly-scored operators.", ""]
    rows = [bp[s] for s in gained]
    rows.sort(key=lambda p: _get(p, "coverage", "t12Listings") or 0, reverse=True)
    lines = [
        f"- {len(gained)} newly scored (present in db output, absent from csv). Top {min(top_n, len(rows))} by T12 volume:",
        "",
        "| name | T12 listings | 7-cell | data tier |",
        "|---|---|---|---|",
    ]
    for pm in rows[:top_n]:
        lines.append(
            f"| {pm.get('name')} | {_fmt(_get(pm, 'coverage', 't12Listings'))} | "
            f"{pm.get('quadrant7Cell')} | {_get(pm, 'coverage', 'dataTier')} |"
        )
    lines.append("")
    return lines


def _percentile(sorted_vals: list, pct: float):
    if not sorted_vals:
        return None
    idx = (len(sorted_vals) - 1) * pct / 100
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * frac


def _distribution(index: dict, group: str, field: str) -> dict:
    vals = sorted(v for v in (_get(pm, group, field) for pm in index.values()) if v is not None)
    return {
        "n": len(vals),
        "median": statistics.median(vals) if vals else None,
        "p10": _percentile(vals, 10),
        "p90": _percentile(vals, 90),
    }


def _star_bucket(delta: int) -> str:
    if delta == 0:
        return "unchanged"
    if delta == 1:
        return "up1"
    if delta >= 2:
        return "up2+"
    if delta == -1:
        return "down1"
    return "down2+"


def _metric_movements_section(both: list, ap: dict, bp: dict) -> list[str]:
    if not both:
        return ["- No operator scored in both runs.", ""]
    lines = [
        "| metric | n | median ∣Δ∣ | unchanged | up1 | up2+ | down1 | down2+ | rating gained/lost |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    movers_lines = []
    for group, value_field, star_field, label, fmt in METRICS:
        diffs = []
        movers = []
        buckets = {"unchanged": 0, "up1": 0, "up2+": 0, "down1": 0, "down2+": 0}
        rating_changed = 0
        for slug in both:
            pa, pb = ap[slug], bp[slug]
            va, vb = _get(pa, group, value_field), _get(pb, group, value_field)
            if va is None or vb is None:
                continue
            d = abs(vb - va)
            diffs.append(d)
            movers.append((d, slug, pa.get("name"), va, vb))

            # Star buckets are computed over this SAME population (both
            # sides have a value) -- not over every operator scored in both
            # runs -- so the bucket counts sum to `n`, not to len(both). A
            # star appearing or disappearing (no rating on one side) is a
            # coverage change, not a delta on the tier scale, so it's
            # reported as its own count instead of being forced through
            # STAR_RANK's None->0 mapping (which used to misread it as a
            # 2+ tier swing).
            sa, sb = _get(pa, group, star_field), _get(pb, group, star_field)
            if sa is None or sb is None:
                if sa != sb:
                    rating_changed += 1
                continue
            delta = STAR_RANK.get(sb, 0) - STAR_RANK.get(sa, 0)
            buckets[_star_bucket(delta)] += 1
        median_change = statistics.median(diffs) if diffs else None
        lines.append(
            f"| {label} | {len(diffs)} | {fmt(median_change) if median_change is not None else 'n/a'} | "
            f"{buckets['unchanged']} | {buckets['up1']} | {buckets['up2+']} | "
            f"{buckets['down1']} | {buckets['down2+']} | {rating_changed} |"
        )
        movers.sort(key=lambda m: m[0], reverse=True)
        if movers:
            movers_lines.append(f"**Top movers — {label}**")
            movers_lines.append("")
            movers_lines.append("| operator | csv | db |")
            movers_lines.append("|---|---|---|")
            for _, slug, name, va, vb in movers[:5]:
                movers_lines.append(f"| {name} | {fmt(va)} | {fmt(vb)} |")
            movers_lines.append("")
    lines.append("")
    return lines + movers_lines


def _direction_word(before, after) -> str:
    """higher / lower / about the same (within +-1 on the raw median photo
    count) -- computed per market from the actual distributions rather than
    assumed, since which way it moves is not the same on every market
    (Bozeman's own numbers come out LOWER on the db side, not higher)."""
    if before is None or after is None:
        return "differently"
    diff = after - before
    if abs(diff) <= 1:
        return "about the same"
    return "higher" if diff > 0 else "lower"


def _marketing_photo_section(ap: dict, bp: dict, both: list) -> list[str]:
    photos_csv = _distribution(ap, "marketing", "photosScore")
    photos_db = _distribution(bp, "marketing", "photosScore")
    raw_csv = _distribution(ap, "marketing", "medianPhotosT12")
    raw_db = _distribution(bp, "marketing", "medianPhotosT12")
    comp_csv = _distribution(ap, "marketing", "compositeScore")
    comp_db = _distribution(bp, "marketing", "compositeScore")

    star_changed = 0
    for slug in both:
        if _get(ap[slug], "marketing", "star") != _get(bp[slug], "marketing", "star"):
            star_changed += 1
    star_pct = round(100 * star_changed / len(both), 1) if both else None
    direction = _direction_word(raw_csv["median"], raw_db["median"])

    def row(label, d_csv, d_db):
        def f(v):
            return f"{v:.1f}" if v is not None else "n/a"
        return (f"| {label} | {f(d_csv['median'])} | {f(d_csv['p10'])} | {f(d_csv['p90'])} | "
                f"{f(d_db['median'])} | {f(d_db['p10'])} | {f(d_db['p90'])} |")

    lines = [
        "The reconciliation gate found the export omits some active photos for "
        "some properties (example: property 9555972 has 35 active images, all "
        "created 2026-08-01, but the export lists only 20 of them; the dropped "
        "ones carry a different source-filename pattern from the kept ones -- "
        "an export photo-selection rule the database doesn't expose). On this "
        f"market, the raw median photo count runs {direction} on the db side "
        "(see the table below); the shift need not be uniform across operators "
        "if it's concentrated in a few properties rather than systemic. "
        "Distribution is across every scored operator on each side (not just "
        "those scored in both), csv vs db:",
        "",
        "| | csv median | csv p10 | csv p90 | db median | db p10 | db p90 |",
        "|---|---|---|---|---|---|---|",
        row("Photos sub-score (0-100, cohort-scaled)", photos_csv, photos_db),
        row("Raw median photos, T12 listings (count)", raw_csv, raw_db),
        row("Marketing composite (internal-only, not ranked)", comp_csv, comp_db),
        "",
        f"- Marketing star changed for {star_changed} / {len(both)} operators scored in both "
        f"({star_pct if star_pct is not None else 'n/a'}%).",
        "",
    ]
    return lines


def report(csv_json_path: str, db_json_path: str, csv_snapshot_meta: Optional[dict] = None,
           lost_operator_notes: Optional[dict] = None) -> str:
    """Markdown before/after for one market: `csv_json_path` and
    `db_json_path` are the pipeline's per-market JSON output from a
    `--source csv` and a `--source db` run of the SAME market at the SAME
    `--as-of`.

    `csv_snapshot_meta` supplies figures the csv-mode run has no sidecar
    file for (csv mode writes no `.meta.json`, unlike a db-mode run):
    `{"input_rows": int, "uru_coverage_pct": float}`. Both are optional;
    missing values render as "n/a" rather than a guess.

    `lost_operator_notes` is `{slug: explanation}` for a lost operator whose
    cause was established by investigation this function can't automate
    (e.g. reading raw snapshot rows) -- it upgrades that operator's verdict
    from UNEXPLAINED to EXPLAINED with the given text.
    """
    a = _load(csv_json_path)
    b = _load(db_json_path)
    ap = _index(a)
    bp = _index(b)
    lost = sorted(set(ap) - set(bp))
    gained = sorted(set(bp) - set(ap))
    both = sorted(set(ap) & set(bp))

    market_label = (ap[next(iter(ap))]["marketId"] if ap else
                    bp[next(iter(bp))]["marketId"] if bp else
                    os.path.basename(csv_json_path))

    counts_lines, counts_facts = _counts_section(a, b, csv_json_path, db_json_path,
                                                  csv_snapshot_meta, ap, bp)
    lost_lines, lost_all_explained = _lost_section(lost, ap, bp, lost_operator_notes)
    gained_lines = _gained_section(gained, bp)
    movement_lines = _metric_movements_section(both, ap, bp)
    photo_lines = _marketing_photo_section(ap, bp, both)

    rows_ok = (counts_facts["csv_rows"] is not None and counts_facts["db_rows"] is not None
               and counts_facts["db_rows"] >= counts_facts["csv_rows"])
    rows_verdict = "PASS" if rows_ok else ("n/a" if counts_facts["db_rows"] is None or
                                            counts_facts["csv_rows"] is None else "FAIL")
    uru_label, uru_verdict = _uru_drop_invariant(counts_facts)
    lost_verdict = "PASS" if lost_all_explained else "FAIL"

    takeaway = (
        f"**Takeaway:** {len(ap)} → {len(bp)} operators scored "
        f"({len(gained)} gained, {len(lost)} lost"
        + (", all explained" if lost and lost_all_explained else
           ", UNEXPLAINED — do not cut over" if lost and not lost_all_explained else "")
        + ")."
    )

    lines = [
        f"## {market_label}",
        "",
        takeaway,
        "",
        "### Counts",
        "",
        *counts_lines,
        "",
        "### Lost operators (scored in csv, not in db)",
        "",
        *lost_lines,
        "### Gained operators (scored in db, not in csv)",
        "",
        *gained_lines,
        "### Metric movements (operators scored in both)",
        "",
        *movement_lines,
        "### Marketing / photos",
        "",
        *photo_lines,
        "### Invariant checklist",
        "",
        "| invariant | result |",
        "|---|---|",
        f"| No unexplained lost operators | {lost_verdict} |",
        f"| Counts move in the expected direction (db >= csv rows) | {rows_verdict} |",
        f"| {uru_label} | {uru_verdict} |",
        "",
    ]
    return "\n".join(lines)


def _combined_report(pairs: list, csv_meta_by_path: Optional[dict] = None,
                      notes: Optional[dict] = None, as_of: Optional[str] = None) -> str:
    header = [
        "# Dwellsy DB source cutover: restatement report",
        "",
        "Per-market before/after for the CSV export -> Dwellsy database "
        "pipeline source switch (`pipeline.py --source csv` vs `--source db`).",
    ]
    if as_of:
        header.append(
            f"Both sides run at the SAME `--as-of {as_of}` — this isolates the "
            "source change (population, current-state photos/amenities/community "
            "counts) from the ~18-day calendar drift between the export's date and "
            "today. A separate, later run advancing `--as-of` to the current date "
            "is expected to move numbers further; that is not what this report "
            "measures."
        )
    header.append("")
    sections = []
    for csv_path, db_path in pairs:
        meta = (csv_meta_by_path or {}).get(csv_path)
        sections.append(report(csv_path, db_path, csv_snapshot_meta=meta, lost_operator_notes=notes))
    return "\n".join(header) + "\n" + "\n".join(sections)


def _main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_paths", nargs="+",
                         help="csv_json db_json [csv_json db_json ...] -- one pair per market")
    parser.add_argument("--out", default=None, help="Write combined markdown here (default: stdout)")
    parser.add_argument("--as-of", default=None, help="The --as-of both runs shared, for the header note")
    parser.add_argument("--csv-meta", default=None,
                         help="JSON file: {csv_json_path: {input_rows, uru_coverage_pct}}")
    parser.add_argument("--notes", default=None,
                         help="JSON file: {lost_operator_slug: explanation}")
    args = parser.parse_args(argv)

    if len(args.json_paths) % 2 != 0:
        parser.error("json_paths must come in csv/db pairs")
    pairs = list(zip(args.json_paths[0::2], args.json_paths[1::2]))

    csv_meta = json.load(open(args.csv_meta, encoding="utf-8")) if args.csv_meta else None
    notes = json.load(open(args.notes, encoding="utf-8")) if args.notes else None

    text = _combined_report(pairs, csv_meta_by_path=csv_meta, notes=notes, as_of=args.as_of)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
