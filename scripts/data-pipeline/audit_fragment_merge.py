#!/usr/bin/env python3
"""Read-only before/after audit for the within-market fragment merge.
Usage: python3 audit_fragment_merge.py OLD_SEED NEW_SEED
Reports duplicate operators collapsed and the NEWLY-ELIGIBLE operators (no
ranked member under the old grouping) for eyeball review before committing."""
import json, sys, collections

def nk(s): return "".join(c.lower() for c in (s or "") if c.isalnum())

old = json.load(open(sys.argv[1])); new = json.load(open(sys.argv[2]))
def by_mkt_name(seed):
    d = collections.defaultdict(list)
    for p in seed["pms"]:
        d[(p.get("marketId"), nk(p["name"]))].append(p)
    return d
o, n = by_mkt_name(old), by_mkt_name(new)

old_pms = len(old["pms"]); new_pms = len(new["pms"])
collapsed = sum(len(v) - 1 for v in o.values() if len(v) > 1)
newly = [(mk, v[0]["name"], v[0].get("coverage", {}).get("t12Listings"))
         for (mk, name), v in n.items() if (mk, name) not in o]
print(f"PMs: {old_pms} -> {new_pms}  (delta {new_pms - old_pms})")
print(f"duplicate operators collapsed (old multi-member name-groups): {collapsed}")
print(f"NEWLY-ELIGIBLE operators (review these — a bad merge here fabricates a ranked op): {len(newly)}")
for mk, name, t12 in sorted(newly, key=lambda x: -(x[2] or 0)):
    print(f"   {mk[:24]:24s} {name[:34]:34s} T12={t12}")
