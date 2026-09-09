#!/usr/bin/env python3
"""Repair rows broken by unquoted commas inside `description`.

The monthly Dwellsy export does not always quote the `description` field. When
its text contains commas the CSV row over-splits: every column after
`description` shifts right, so `creation_time` / `deactivation_time` end up
holding prose. `merge_listings.py` guards `dataAsOf` against that junk, but the
bad rows still reach the canonical merged CSV with unusable dates.

The break is deterministic: `description` is the only unquoted free-text column,
so a row with N extra fields had its description split into N+1 pieces. Re-join
those pieces and every later column lands back in place.

Rows that still fail to yield a parseable date after repair are dropped, and
both counts are reported.

Usage: python3 repair_export_quoting.py EXPORT.csv [...]   # writes *_clean.csv
"""
import csv, os, re, sys

csv.field_size_limit(10 ** 9)
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def repair(path):
    out_path = re.sub(r"\.csv$", "_clean.csv", path)
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        rdr = csv.reader(fh)
        hdr = next(rdr)
        n = len(hdr)
        di = hdr.index("description")
        ci, dti = hdr.index("creation_time"), hdr.index("deactivation_time")
        fixed = dropped = passthru = 0
        with open(out_path, "w", newline="", encoding="utf-8") as out:
            w = csv.writer(out)
            w.writerow(hdr)
            for row in rdr:
                if len(row) == n:
                    passthru += 1
                    w.writerow(row)
                    continue
                extra = len(row) - n
                if extra > 0:
                    merged = ",".join(row[di:di + extra + 1])
                    row = row[:di] + [merged] + row[di + extra + 1:]
                # Only keep a repaired row if its dates now parse.
                ok = all(
                    (not (row[i] or "").strip()) or DATE.match((row[i] or "").strip())
                    for i in (ci, dti)
                )
                if len(row) == n and ok:
                    fixed += 1
                    w.writerow(row)
                else:
                    dropped += 1
    return out_path, passthru, fixed, dropped


def main(paths):
    any_change = False
    for p in paths:
        out, passthru, fixed, dropped = repair(p)
        if fixed or dropped:
            any_change = True
            print("  %s" % os.path.basename(p))
            print("     clean rows passed through: %s" % f"{passthru:,}")
            print("     rows REPAIRED:             %d" % fixed)
            print("     rows DROPPED (unfixable):  %d" % dropped)
            print("     -> %s" % os.path.basename(out))
        else:
            os.remove(out)
            print("  %s — no malformed rows, no clean file needed" % os.path.basename(p))
    if not any_change:
        print("\n  nothing to repair")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
