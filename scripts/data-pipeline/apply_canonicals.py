#!/usr/bin/env python3
"""Apply curated canonical-operator decisions to per-market JSONs.

Reads `canonical_decisions_<version>.json` and patches each affected
per-market `Scorecard_Data_v0.6.4_<slug>.json` so that PMs that should
collapse into a canonical entity carry the matching canonicalOperatorId.

The per-market JSONs in `Product Support/` are the raw pipeline output
plus any prior canonical patches. This script is the surgical editor
that converts a human-curated decisions JSON into per-market mutations,
keeping the decisions auditable in version control while leaving the
big data files outside the repo.

Workflow:

    # Curate decisions by hand (or start from merge.py --propose-canonicals):
    vim canonical_decisions_v064_p2.json

    # Dry-run to see exactly which PMs get patched:
    python apply_canonicals.py --decisions canonical_decisions_v064_p2.json

    # Apply (backs up each per-market JSON first):
    python apply_canonicals.py --decisions canonical_decisions_v064_p2.json --apply

    # Then merge:
    python merge.py --apply

Safety:
    - Defaults to --dry-run. Shows exactly which (pm_slug, marketId,
      old_id, new_id, canonical_name_override) edits would happen.
    - --apply snapshots each affected per-market JSON to
      <file>.<timestamp>.bak before in-place edits.
    - Validates every pm_slug in the decisions file actually exists in
      a per-market JSON, with a clear error otherwise.
    - Idempotent — re-running with the same decisions file produces the
      same per-market JSONs (no double-application drift).
"""

import argparse
import json
import os
import shutil
import sys
import time
from collections import defaultdict


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.expanduser(
    "~/Documents/Claude/Projects/Product Support"
)


def load_registry(path):
    with open(path) as f:
        return json.load(f)


def find_per_market_path(data_dir, market_id, registry):
    for m in registry["markets"]:
        if m["id"] == market_id:
            return os.path.join(
                data_dir,
                f"Scorecard_Data_v0.6.4_{m['outputSlug']}.json",
            )
    return None


def main():
    p = argparse.ArgumentParser(
        description="Apply curated canonical-operator decisions to per-market JSONs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--decisions",
        default=os.path.join(SCRIPT_DIR, "canonical_decisions_v064_p2.json"),
        help="Path to canonical_decisions_<version>.json",
    )
    p.add_argument(
        "--registry",
        default=os.path.join(SCRIPT_DIR, "markets.json"),
        help="Path to markets.json (looked up to resolve marketId → file)",
    )
    p.add_argument(
        "--data-dir",
        default=None,
        help="Folder with per-market JSONs (default $IQ_DATA_DIR or ~/Documents/Claude/Projects/Product Support)",
    )
    p.add_argument(
        "--apply",
        action="store_true",
        help="Write changes in place (default is dry-run).",
    )
    args = p.parse_args()

    data_dir = args.data_dir or os.environ.get("IQ_DATA_DIR") or DEFAULT_DATA_DIR
    if not os.path.isdir(data_dir):
        sys.exit(f"[apply_canonicals] data-dir does not exist: {data_dir}")

    with open(args.decisions) as f:
        decisions = json.load(f)
    registry = load_registry(args.registry)
    markets_by_id = {m["id"]: m for m in registry["markets"]}

    print(
        f"[apply_canonicals] {decisions.get('version', '?')} — "
        f"{len(decisions.get('extend_existing', []))} extensions, "
        f"{len(decisions.get('new_canonicals', []))} new canonicals, "
        f"{len(decisions.get('rejected', []))} rejections (informational)"
    )

    # Plan: build a list of (file_path, pm_slug, new_canonical_id,
    # new_canonical_name) edits, grouped by file.
    edits_by_file = defaultdict(list)
    errors = []

    def resolve_pm(pm_slug):
        """Return (file_path, market_id). Errors out if not found."""
        # Try every per-market file and return the one containing this slug.
        # Could index up front but only ~50 lookups so brute force is fine.
        for m in registry["markets"]:
            path = os.path.join(
                data_dir,
                f"Scorecard_Data_v0.6.4_{m['outputSlug']}.json",
            )
            if not os.path.isfile(path):
                continue
            with open(path) as f:
                blob = json.load(f)
            for pm in blob.get("pms", []):
                if pm["slug"] == pm_slug:
                    return path, m["id"]
        return None, None

    # Process extensions (folding new PMs into existing canonicals).
    for ext in decisions.get("extend_existing", []):
        canonical_slug = ext["canonical_slug"]
        for pm_slug in ext.get("add_pm_slugs", []):
            file_path, market_id = resolve_pm(pm_slug)
            if file_path is None:
                errors.append(f"extension PM not found: {pm_slug}")
                continue
            edits_by_file[file_path].append({
                "pm_slug": pm_slug,
                "new_canonical_id": canonical_slug,
                "new_canonical_name": None,  # extension — keep existing canonical's name
                "market_id": market_id,
                "kind": "extend",
            })

    # Process new canonicals.
    for nc in decisions.get("new_canonicals", []):
        canonical_slug = nc["canonical_slug"]
        canonical_name = nc.get("canonical_name")
        for pm_slug in nc.get("pm_slugs", []):
            file_path, market_id = resolve_pm(pm_slug)
            if file_path is None:
                errors.append(f"new-canonical PM not found: {pm_slug}")
                continue
            edits_by_file[file_path].append({
                "pm_slug": pm_slug,
                "new_canonical_id": canonical_slug,
                "new_canonical_name": canonical_name,
                "market_id": market_id,
                "kind": "new",
            })

    if errors:
        print(f"\n[apply_canonicals] ⚠ {len(errors)} errors:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)

    # Print plan.
    print(f"\n[apply_canonicals] plan: {sum(len(v) for v in edits_by_file.values())} PM edits across {len(edits_by_file)} files")
    for file_path in sorted(edits_by_file):
        rel = os.path.relpath(file_path, data_dir)
        print(f"  {rel} ({len(edits_by_file[file_path])} edits)")

    # Apply or dry-run.
    if not args.apply:
        print(f"\n[apply_canonicals] DRY-RUN — first 10 edits:")
        all_edits = [
            (fp, e)
            for fp, edits in edits_by_file.items()
            for e in edits
        ]
        for fp, e in all_edits[:10]:
            print(
                f"  {os.path.basename(fp):42s} "
                f"{e['pm_slug']:50s} → {e['new_canonical_id']}"
                + (f"  ({e['kind']})" if e['kind'] == 'extend' else f"  (new: {e['new_canonical_name']})")
            )
        if len(all_edits) > 10:
            print(f"  ... and {len(all_edits) - 10} more")
        print(f"\n[apply_canonicals] Run with --apply to write changes.")
        return

    # --apply: snapshot + write each file.
    ts = time.strftime("%Y%m%dT%H%M%S")
    for file_path, edits in edits_by_file.items():
        backup = f"{file_path}.{ts}.bak"
        shutil.copyfile(file_path, backup)
        print(f"  backed up → {os.path.basename(backup)} ({os.path.getsize(backup):,} bytes)")
        with open(file_path) as f:
            blob = json.load(f)
        pm_by_slug = {pm["slug"]: pm for pm in blob.get("pms", [])}
        applied = 0
        for e in edits:
            pm = pm_by_slug.get(e["pm_slug"])
            if pm is None:
                print(f"    ⚠ {e['pm_slug']} disappeared between dry-run and apply — skipping")
                continue
            old_id = pm.get("canonicalOperatorId")
            old_name = pm.get("canonicalOperatorName")
            pm["canonicalOperatorId"] = e["new_canonical_id"]
            if e["new_canonical_name"]:
                pm["canonicalOperatorName"] = e["new_canonical_name"]
            applied += 1
            if old_id == e["new_canonical_id"] and old_name == (e["new_canonical_name"] or old_name):
                continue  # noop (idempotent re-apply)
        # Write back, indented for readability + git-diff-friendliness.
        with open(file_path, "w") as f:
            json.dump(blob, f, indent=2)
        print(f"    wrote {applied} edits → {os.path.basename(file_path)} ({os.path.getsize(file_path):,} bytes)")

    print(f"\n[apply_canonicals] done. Next: python merge.py to dry-run, then --apply.")


if __name__ == "__main__":
    main()
