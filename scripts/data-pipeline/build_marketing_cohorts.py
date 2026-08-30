"""Build the national marketing-cohort distribution.

WHY THIS EXISTS
---------------
Marketing Discipline stars were systematically easier for institutional
operators to earn, through a mechanism nobody chose.

The star ladder is: primary (MSA x 7-cell) -> fallback (MSA x op_type, which
DROPS the Institutional/Independent axis) -> msa (everyone). Institutional
operators are rare per market (~309 across 44 markets), so their primary cohort
almost never reaches the N>=10 floor: measured on the shipped seed, 76.7% of
institutional operators scored on `fallback` versus 1.2% of independents.

That matters because the marketing composite is strongly confounded with
operator type and scale — median composite runs 85.6 for Large MF/BTR
Institutional against 57.6 for Small MF/BTR Independent. So the fallback
dropped the confounding axis and compared institutional operators against
independents who structurally score lower. Result: 50.3% of institutional
operators earned gold versus 26.8% of independents, where a quartile star
should give ~25% to everyone.

THE FIX: relax GEOGRAPHY instead of the classification. A listing description
has no local baseline the way days-on-market or rent do — good copy is good
copy anywhere — so the same 7-cell nationally is a truer peer group than a
different 7-cell locally. Simulated against the shipped seed:

    ladder                                  spread   inst    indep
    current (fallback drops scale)          28.5pt   50.3%   26.8%
    fallback drops type instead             25.4pt   38.1%   28.1%
    fallback = same 7-cell NATIONAL          2.1pt   26.0%   25.2%   <- chosen
    fallback = same op_type NATIONAL        30.5pt   44.5%   24.4%

Only the national 7-cell cohort removes the distortion. Note this fix is
surgical: the ~85% of operators whose local 7-cell cohort already clears N>=10
keep scoring against their local peers exactly as before. Only the operators
who were falling through to a broken fallback change.

pipeline.py runs one market at a time and has no cross-market view, so the
national distribution is precomputed here and shipped alongside the CSVs, the
same pattern as Operator_National_Urus_v0.6.2.json.

USAGE
-----
    python3 build_marketing_cohorts.py [--seed PATH] [--out PATH]

Reads the merged seed (all markets) and writes a 7-cell -> sorted-score map.
Run it after a full refresh and before the star-assignment pass that consumes
it; the distribution only shifts when marketing scores across the whole
portfolio move.
"""

import argparse
import json
import os
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DEFAULT_SEED = os.path.join(REPO_ROOT, "src", "data", "scorecard_data.json")
DEFAULT_OUT = os.path.join(SCRIPT_DIR, "marketing_national_cohorts.json")

# Mirrors star_for_pct's floor in pipeline.py. A national cohort below this is
# not a usable distribution, so the consumer must fall through rather than
# score against it.
MIN_COHORT_N = 10


def build(seed_path):
    with open(seed_path) as f:
        seed = json.load(f)
    cohorts = defaultdict(list)
    skipped = defaultdict(int)
    for pm in seed.get("pms", []):
        q7 = pm.get("quadrant7Cell")
        score = (pm.get("marketing") or {}).get("compositeScore")
        # Same population the local cohorts use: ranked PMs only. Brokers score
        # in their own cohort and dormant operators are measured against a
        # cohort without joining it (see cohort_members in pipeline.py).
        if pm.get("operatorType") != "pm":
            skipped["broker"] += 1
            continue
        if pm.get("operatorStatus") == "dormant":
            skipped["dormant"] += 1
            continue
        if not q7 or not isinstance(score, (int, float)):
            skipped["no q7 or score"] += 1
            continue
        cohorts[q7].append(float(score))
    return (
        {k: sorted(v) for k, v in sorted(cohorts.items())},
        dict(skipped),
        seed.get("methodologyVersion"),
        seed.get("dataAsOf"),
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", default=DEFAULT_SEED)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    cohorts, skipped, mversion, as_of = build(args.seed)
    payload = {
        "_comment": (
            "National marketing-composite distribution per 7-cell, consumed by "
            "pipeline.py as the Marketing Discipline fallback cohort. Regenerate "
            "with build_marketing_cohorts.py after a full refresh."
        ),
        "generatedFromSeed": os.path.relpath(args.seed, REPO_ROOT),
        "methodologyVersion": mversion,
        "dataAsOf": as_of,
        "minCohortN": MIN_COHORT_N,
        "cohorts": cohorts,
    }
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

    print(f"wrote {args.out}")
    print(f"  methodologyVersion={mversion} dataAsOf={as_of}")
    for k, v in cohorts.items():
        flag = "" if len(v) >= MIN_COHORT_N else "   <- BELOW MIN, consumer will fall through"
        print(f"  {k:<32} n={len(v):>5}  p50={v[len(v)//2]:>5.1f}{flag}")
    if skipped:
        print(f"  skipped: {skipped}")


if __name__ == "__main__":
    main()
