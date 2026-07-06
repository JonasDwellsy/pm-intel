#!/usr/bin/env python3
"""Re-case canonicalOperatorName / parentCompanyName in the COMMITTED seed
blob (src/data/scorecard_data.json) to match the acronym casing already
applied to pm.name.

WHY THIS EXISTS
---------------
normalize_pm_names.py fixes acronym casing on the per-market pipeline JSONs,
and (since 51af24a) covers canonicalOperatorName + parentCompanyName too. But
the committed merged seed blob predates that coverage: pm.name reads correctly
("CR Holland") while canonicalOperatorName / parentCompanyName are still the
source's title-cased form ("Cr Holland"). That drift shows only on the surfaces
that read the canonical field — the Classic scorecard header, the PDF export,
and the operator-profile page — not the New scorecard or the market list (which
render-guard around it in slugify.ts).

The clean fix is a full pipeline refresh (normalize_pm_names.py → merge.py),
but that's a deliberate, heavier batch job (it also regenerates prose and has a
source-drift gotcha). This script is the surgical stopgap: it applies the SAME
normalize_name() — imported directly from normalize_pm_names.py so the logic
can't diverge — to those two fields in the committed blob only. No pipeline
run, no prose regen. When the full refresh eventually happens it produces the
identical casing, so this introduces no divergence.

SAFETY
------
normalize_name only rewrites acronym-allowlist tokens + 2-char tokens; it
leaves brand casing intact (e.g. "HomeRiver" stays "HomeRiver"), so unlike
copying pm.name over the field it can't regress a canonical that already had
better casing than its members. Verified empirically: for every drift case in
the current blob, normalize(canonical) == pm.name exactly (0 divergences).

Usage:
    python recase_seed_canonical_names.py            # dry-run (default)
    python recase_seed_canonical_names.py --apply     # write in place
"""

import argparse
import json
import os
import sys
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Repo root is two levels up from scripts/data-pipeline/.
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
SEED_PATH = os.path.join(REPO_ROOT, "src", "data", "scorecard_data.json")

sys.path.insert(0, SCRIPT_DIR)
from normalize_pm_names import (  # noqa: E402
    load_acronyms,
    build_acronym_map,
    normalize_name,
)

FIELDS = ("canonicalOperatorName", "parentCompanyName")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--acronyms", default=os.path.join(SCRIPT_DIR, "pm_name_acronyms.json"))
    p.add_argument("--seed", default=SEED_PATH)
    p.add_argument("--apply", action="store_true", help="Write changes (default: dry-run).")
    args = p.parse_args()

    acronyms, stopwords = load_acronyms(args.acronyms)
    amap = build_acronym_map(acronyms)
    print(f"[recase-seed] {len(acronyms)} acronyms + {len(stopwords)} stopwords")

    with open(args.seed, encoding="utf-8") as f:
        blob = json.load(f)
    pms = blob.get("pms")
    if not isinstance(pms, list):
        sys.exit("[recase-seed] could not find pms[] in seed blob")

    per_field = {fld: [] for fld in FIELDS}
    divergences = []  # value differs from pm.name only by case, but normalizes to something else
    for pm in pms:
        name = pm.get("name") or ""
        for fld in FIELDS:
            v = pm.get(fld)
            if not v:
                continue
            nv = normalize_name(v, amap, stopwords)
            if nv != v:
                per_field[fld].append((v, nv))
                if v.lower() == name.lower() and nv != name:
                    divergences.append((fld, name, v, nv))

    total = sum(len(v) for v in per_field.values())
    for fld in FIELDS:
        print(f"[recase-seed] {fld}: {len(per_field[fld])} change(s)")
    if divergences:
        # Not a hard stop — normalize preserves brand casing on purpose — but
        # surface these so a human can eyeball any case where the canonical's
        # normalized form legitimately differs from the member's pm.name.
        print(f"[recase-seed] NOTE {len(divergences)} normalized value(s) differ from pm.name "
              f"(brand casing preserved — review):")
        for fld, name, v, nv in divergences[:20]:
            print(f"    {fld}: name={name!r} {v!r} -> {nv!r}")

    print("\n[recase-seed] distinct transforms:")
    combined = Counter(per_field["canonicalOperatorName"] + per_field["parentCompanyName"])
    for (b, a), n in combined.most_common():
        print(f"  {n:4d}  {b!r} -> {a!r}")

    if not args.apply:
        print(f"\n[recase-seed] DRY-RUN — {total} field change(s). Re-run with --apply to write.")
        return

    changed = 0
    for pm in pms:
        for fld in FIELDS:
            v = pm.get(fld)
            if not v:
                continue
            nv = normalize_name(v, amap, stopwords)
            if nv != v:
                pm[fld] = nv
                changed += 1

    # Match the generator's format exactly: minified, ASCII-escaped, no trailing
    # newline — so the git diff is limited to the intended field edits.
    with open(args.seed, "w", encoding="utf-8") as f:
        json.dump(blob, f, separators=(",", ":"), ensure_ascii=True)
    print(f"\n[recase-seed] wrote {changed} field change(s) to {os.path.relpath(args.seed, REPO_ROOT)}")


if __name__ == "__main__":
    main()
