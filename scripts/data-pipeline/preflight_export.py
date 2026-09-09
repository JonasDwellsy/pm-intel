#!/usr/bin/env python3
"""Validate a monthly export CSV before merging it.

Checks the things that have actually bitten this refresh before: missing
columns, msa_code values that match no tracked market, unparseable dates
(the column-shift garbage that corrupts dataAsOf), and whether the export
would advance each market's dataAsOf at all.

Usage: python3 preflight_export.py EXPORT.csv [EXPORT2.csv ...]
"""
import csv, json, os, re, sys, collections

REQUIRED = ["listing_id", "msa_code", "creation_time", "deactivation_time",
            "rent_amount", "community_id", "company_name",
            "parent_company_id", "parent_company_name", "bedrooms",
            "description", "latitude", "longitude"]
DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
HERE = os.path.dirname(os.path.abspath(__file__))


def main(paths):
    cfg = json.load(open(os.path.join(HERE, "markets.json")))
    by_msa = {m["msaCode"]: m for m in cfg["markets"] if m.get("msaCode")}
    ok = True
    for p in paths:
        print("\n=== %s ===" % os.path.basename(p))
        if not os.path.exists(p):
            print("  MISSING FILE"); ok = False; continue
        print("  size: %.2f GB" % (os.path.getsize(p) / 1e9))
        csv.field_size_limit(10 ** 9)
        with open(p, newline="", encoding="utf-8", errors="replace") as fh:
            rdr = csv.DictReader(fh)
            cols = rdr.fieldnames or []
            missing = [c for c in REQUIRED if c not in cols]
            if missing:
                print("  MISSING COLUMNS: %s" % ", ".join(missing)); ok = False
            else:
                print("  columns: all %d required present" % len(REQUIRED))
            rows = 0
            per_msa = collections.Counter()
            maxdate = collections.defaultdict(str)
            baddate = 0
            for row in rdr:
                rows += 1
                msa = (row.get("msa_code") or "").strip()
                per_msa[msa] += 1
                for k in ("creation_time", "deactivation_time"):
                    v = (row.get(k) or "").strip()
                    if not v:
                        continue
                    m = DATE_RE.match(v)
                    if not m:
                        baddate += 1
                    elif v[:10] > maxdate[msa]:
                        maxdate[msa] = v[:10]
        print("  rows: %s" % f"{rows:,}")
        if baddate:
            print("  UNPARSEABLE DATE VALUES: %s (column shift?)" % f"{baddate:,}")
            ok = False
        known = [m for m in per_msa if m in by_msa]
        unknown = [m for m in per_msa if m not in by_msa]
        print("  msa_codes matching a tracked market: %d" % len(known))
        if unknown:
            print("  msa_codes with NO tracked market (%d, ignored by merge): %s"
                  % (len(unknown), ", ".join(sorted(unknown)[:10])))
        adv, stale = [], []
        for msa in known:
            mk = by_msa[msa]
            new, cur = maxdate[msa], mk.get("dataAsOf") or ""
            (adv if new > cur else stale).append((mk["id"], cur, new))
        print("  markets whose dataAsOf WOULD ADVANCE: %d" % len(adv))
        for mid, cur, new in sorted(adv)[:6]:
            print("     %-46s %s -> %s" % (mid, cur, new))
        if len(adv) > 6:
            print("     ... and %d more" % (len(adv) - 6))
        if stale:
            print("  markets present but NOT advancing: %d" % len(stale))
            for mid, cur, new in sorted(stale)[:6]:
                print("     %-46s stays %s (export max %s)" % (mid, cur, new or "-"))
        covered = set(known)
        absent = [m["id"] for c, m in by_msa.items() if c not in covered]
        if absent:
            print("  tracked markets ABSENT from this export: %d" % len(absent))
            for mid in sorted(absent)[:8]:
                print("     %s" % mid)
            if len(absent) > 8:
                print("     ... and %d more" % (len(absent) - 8))
    print("\n%s" % ("PREFLIGHT OK" if ok else "PREFLIGHT FOUND PROBLEMS — fix before merging"))
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1:]))
