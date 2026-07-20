#!/usr/bin/env python3
"""Inspect management-model website verdicts for spot-checking.

Joins the classifier's verdict cache (management_model_website.json) with
company names/URLs (company_enrichment.json) and prints a readable table:
name | verdict | confidence | matched keywords | url. The `matched` column is
the spot-check aid — it shows exactly which phrases drove each verdict, so you
can click the URL and confirm the site really does (or doesn't) market
management services.

Usage (from scripts/data-pipeline/):
  python3 show_management_verdicts.py                 # all cached verdicts
  python3 show_management_verdicts.py --verdict third_party
  python3 show_management_verdicts.py --confidence high
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CACHE = os.path.join(ROOT, "src", "data", "management_model_website.json")
ENRICH = os.path.join(ROOT, "src", "data", "company_enrichment.json")
SEED = os.path.join(ROOT, "src", "data", "scorecard_data.json")

ORDER = {"third_party": 0, "owner_operator": 1, "inconclusive": 2}
CONF_ORDER = {"high": 0, "medium": 1, None: 2}


def build_name_map():
    """companyId -> operator name + quadrant7Cell, from the seed (the reliable
    source; company_enrichment.name is often blank). Falls back to enrich name."""
    names, q7 = {}, {}
    try:
        seed = json.load(open(SEED))
        for pm in seed.get("pms", []):
            cid = pm.get("companyId")
            if cid and cid not in names:
                names[str(cid)] = pm.get("name") or ""
                q7[str(cid)] = pm.get("quadrant7Cell") or ""
    except Exception:
        pass
    return names, q7


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verdict", choices=["third_party", "owner_operator", "inconclusive"])
    ap.add_argument("--confidence", choices=["high", "medium"])
    args = ap.parse_args()

    cache = json.load(open(CACHE))
    enrich = json.load(open(ENRICH))
    names, q7 = build_name_map()

    rows = []
    for cid, v in cache.items():
        if args.verdict and v.get("verdict") != args.verdict:
            continue
        if args.confidence and v.get("confidence") != args.confidence:
            continue
        name = names.get(cid) or (enrich.get(cid) or {}).get("name") or "(unknown)"
        rows.append({
            "name": name,
            "q7": q7.get(cid, ""),
            "verdict": v.get("verdict"),
            "confidence": v.get("confidence"),
            "matched": ", ".join(v.get("matched") or []),
            "url": v.get("url") or "",
            "error": v.get("error"),
        })
    rows.sort(key=lambda r: (ORDER.get(r["verdict"], 9), CONF_ORDER.get(r["confidence"], 9), r["name"].lower()))

    counts = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    print(f"{len(rows)} verdicts | " + " | ".join(f"{k}={n}" for k, n in sorted(counts.items())))
    print()

    w_name = min(38, max((len(r["name"]) for r in rows), default=4))
    for r in rows:
        conf = (r["confidence"] or "").upper()
        q7 = f"  [{r['q7']}]" if r["q7"] else ""
        head = f"{r['name'][:w_name].ljust(w_name)}  {r['verdict']:<14} {conf:<6}{q7}"
        print(head)
        if r["matched"]:
            print(f"{'':<{w_name}}    matched: {r['matched']}")
        if r["error"]:
            print(f"{'':<{w_name}}    error:   {r['error']}")
        print(f"{'':<{w_name}}    {r['url']}")
        print()


if __name__ == "__main__":
    main()
