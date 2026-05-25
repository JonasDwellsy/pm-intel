#!/usr/bin/env python3
"""v0.6.4 per-market JSON → merged seed (src/data/scorecard_data.json).

Combines the per-market JSONs (one per market in markets.json) into the
single merged seed file that prisma/seed.ts consumes. Also handles the
canonical-operator aggregation: PMs that share a `canonicalOperatorId`
across markets get rolled up into the top-level `canonicalOperators`
object with aggregate stats.

Safety model
============

This script defaults to --dry-run. The --apply mode (which actually
overwrites scorecard_data.json) requires explicit opt-in and always
snapshots the existing file first to a timestamped .bak.

Three modes:

  --dry-run (DEFAULT)
      Builds the merged JSON in /tmp, prints a structural diff against
      the current scorecard_data.json (markets added/removed, PM counts
      per market, canonical-operator changes), exits without writing.
      Safe to run anytime.

  --propose-canonicals
      Analyzes per-market PM names for cross-market collisions that
      look like they should be canonicalized but aren't yet (i.e., new
      Seattle/Denver operators whose normalized name matches an existing
      single-market PM in another market). Writes a proposal JSON for
      human review. Does NOT mutate scorecard_data.json.

  --apply
      Snapshots scorecard_data.json to .bak.<timestamp>, then writes the
      merged JSON in place. Use after --dry-run looks correct AND any
      canonical-mapping curation is done.

The canonical-operator assignment for existing markets is preserved
verbatim from the per-market JSONs (they were already curated upstream).
The merge step itself doesn't touch canonical assignments — that's
controlled exclusively by the canonical_mapping JSON (see --canonical).

Usage
=====

    # Default dry-run, prints diff:
    python merge.py

    # Generate canonical-mapping proposal for new markets:
    python merge.py --propose-canonicals \\
        --new-markets seattle-wa,denver-co \\
        --out /tmp/canonical_proposal.json

    # After diff looks good + canonical curation done:
    python merge.py --apply

See README.md for the full add-a-market runbook.
"""

import argparse
import json
import os
import re
import shutil
import sys
import time
from collections import defaultdict, Counter
from datetime import datetime, timezone


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DEFAULT_DATA_DIR = os.path.expanduser("~/Documents/Claude/Projects/Product Support")
DEFAULT_TARGET = os.path.join(REPO_ROOT, "src", "data", "scorecard_data.json")


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_registry(registry_path):
    with open(registry_path) as f:
        return json.load(f)


def load_per_market(data_dir, output_slug):
    path = os.path.join(data_dir, f"Scorecard_Data_v0.6.4_{output_slug}.json")
    if not os.path.isfile(path):
        sys.exit(
            f"[merge] missing per-market JSON: {path}\n"
            f"  Run: python pipeline.py --market <id> first."
        )
    with open(path) as f:
        return json.load(f), path


# v0.6.4 Patch 5 — coverage-point schema normalization. Different pipeline
# generations emitted points with three different shapes:
#   - {lat, lng, address, city, type}   ← modern pipeline (v0.6.4-native
#     markets: Birmingham/Huntsville/Montgomery/Seattle/Denver/San Antonio/
#     Boulder/Fort Collins). 63% of the points in the merged seed.
#   - {lat, lon}                        ← MSA backdrop points, minimal
#   - {lat, lon, n, city, type}         ← v0.6.3-era markets (Phoenix,
#     Jacksonville, the five TN markets). Aggregated by location.
#
# This mismatch was a SILENT BUG: CoverageMapClient.tsx reads `p.lon`,
# so any point with `lng` instead rendered as [undefined, lat] which
# Mapbox skips. 63% of operator-coverage dots simply didn't appear.
#
# Normalization rule: everything becomes {lat, lon, n}. The lng→lon
# rename happens here; address/city/type are dropped (dead fields, never
# consumed downstream); n defaults to 1 when not aggregated. Also halves
# the JSON size since the dead fields were ~50 bytes/point × ~99K points.
def normalize_coverage_points(points):
    out = []
    for p in points or []:
        lat = p.get("lat")
        lon = p.get("lon", p.get("lng"))
        if lat is None or lon is None:
            continue  # drop malformed points
        n = p.get("n", 1)
        point = {"lat": lat, "lon": lon, "n": n}
        # Keep `city` when present — OperatorProfilePDF.tsx groups points
        # by city to compute centroids for the PDF map's city labels.
        # Dropping it would silently kill city labels on PDF maps for the
        # markets that previously had them.
        city = p.get("city")
        if city:
            point["city"] = city
        out.append(point)
    return out


def normalize_pms_inplace(pms):
    """Strip dead fields + normalize coverage points across the merged PM
    array. Mutates each PM dict in place."""
    for pm in pms:
        gc = pm.get("geographicCoverage")
        if gc and "coverageMapPoints" in gc:
            gc["coverageMapPoints"] = normalize_coverage_points(
                gc["coverageMapPoints"]
            )


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def merge_markets(per_market_blobs, methodology_version="v0.6.4"):
    """Combine per-market JSONs into a single merged blob.

    The canonical-operator IDs on each PM are preserved verbatim from
    the per-market JSON. We recompute the top-level canonicalOperators
    aggregate from the union of PMs (groups of PMs sharing the same
    canonicalOperatorId become a canonical entity).
    """
    merged = {
        "$schema": "v0.6.4",
        "methodologyVersion": methodology_version,
        "designVersion": "v1.0",
        "dataAsOf": None,  # set below to max of per-market dataAsOf
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "marketCount": len(per_market_blobs),
        "markets": [],
        "pms": [],
        "canonicalOperators": {},
    }

    max_data_as_of = None
    slug_counts = Counter()

    for blob in per_market_blobs:
        # Each per-market JSON has markets[] of length 1.
        merged["markets"].extend(blob["markets"])
        for pm in blob["pms"]:
            # Intentionally NOT deduping. The upstream Python pipeline
            # occasionally produces two PMs in the same market whose
            # names slugify identically (e.g., "Asset Realty Management
            # Inc" vs "Asset Realty Management, Inc." both → the same
            # slug). prisma/seed.ts has a deterministic disambiguator
            # that handles this at DB-write time (appends -2/-3 suffix).
            # We pass duplicates through verbatim and surface them in
            # the validation report; root-cause fix at the pipeline is
            # on the methodology backlog.
            slug_counts[pm["slug"]] += 1
            merged["pms"].append(pm)
        if blob.get("dataAsOf") and (max_data_as_of is None or blob["dataAsOf"] > max_data_as_of):
            max_data_as_of = blob["dataAsOf"]

    merged["dataAsOf"] = max_data_as_of
    duplicate_slugs = [s for s, n in slug_counts.items() if n > 1]

    # Roll up canonicalOperators from the merged PM set.
    co_groups = defaultdict(list)
    for pm in merged["pms"]:
        cid = pm.get("canonicalOperatorId")
        if cid:
            co_groups[cid].append(pm)

    canonical_operators = {}
    for cid, group in co_groups.items():
        distinct_markets = {pm["marketId"] for pm in group}
        if len(distinct_markets) < 2:
            # Only cross-market entities get a top-level canonicalOperators
            # entry. Single-market operators (including intra-market slug
            # collisions like Knoxville's Asset Realty Management Inc /
            # Inc., which share a slug) are NOT canonical entities — they
            # remain per-market PMs and seed.ts disambiguates them.
            continue
        canonical_name = group[0].get("canonicalOperatorName") or group[0]["name"]
        canonical_operators[cid] = {
            "canonicalSlug": cid,
            "canonicalName": canonical_name,
            "marketIds": sorted(distinct_markets),
            "pmSlugs": sorted(pm["slug"] for pm in group),
            "marketCount": len(distinct_markets),
            "aggregateStats": {
                "totalT12Listings": sum(pm.get("t12Listings", 0) or 0 for pm in group),
                "totalT24T12Listings": sum(pm.get("t24t12Listings", 0) or 0 for pm in group),
                "totalUrusT12": sum(pm.get("urusT12", 0) or 0 for pm in group),
            },
        }

    merged["canonicalOperators"] = canonical_operators
    # v0.6.4 Patch 5 — normalize coverage-point schema across all PMs.
    # Drops the lng/lon/address/city/type inconsistency that left 63%
    # of operator-coverage dots invisible on the in-page map. See
    # normalize_coverage_points() docstring above for the rationale.
    normalize_pms_inplace(merged["pms"])
    # Surface duplicate slugs as INFO (seed.ts will disambiguate them with
    # -2/-3 suffixes — both records persist in the DB).
    merged["_merge_info"] = {"duplicate_pm_slugs": duplicate_slugs} if duplicate_slugs else {}
    return merged


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

REQUIRED_TOP_KEYS = {"methodologyVersion", "dataAsOf", "marketCount", "markets", "pms", "canonicalOperators"}
REQUIRED_MARKET_KEYS = {"id", "msaCode", "city", "state", "fullName"}
REQUIRED_PM_KEYS = {"slug", "name", "marketId", "canonicalOperatorId"}


def validate(merged):
    errors = []
    missing = REQUIRED_TOP_KEYS - set(merged.keys())
    if missing:
        errors.append(f"missing top-level keys: {missing}")
    if merged.get("marketCount") != len(merged.get("markets", [])):
        errors.append(f"marketCount {merged.get('marketCount')} != len(markets) {len(merged.get('markets', []))}")
    seen_market_ids = set()
    for m in merged.get("markets", []):
        miss = REQUIRED_MARKET_KEYS - set(m.keys())
        if miss:
            errors.append(f"market {m.get('id', '?')} missing keys: {miss}")
        if m.get("id") in seen_market_ids:
            errors.append(f"duplicate market id: {m.get('id')}")
        seen_market_ids.add(m.get("id"))
    pm_market_ids = Counter(pm.get("marketId") for pm in merged.get("pms", []))
    for mid in pm_market_ids:
        if mid not in seen_market_ids:
            errors.append(f"pm references unknown marketId: {mid}")
    for pm in merged.get("pms", [])[:3]:  # spot-check shape on a few
        miss = REQUIRED_PM_KEYS - set(pm.keys())
        if miss:
            errors.append(f"pm {pm.get('slug', '?')} missing keys: {miss}")
    # Duplicate PM slugs are passed through verbatim — seed.ts disambiguates
    # them. We surface them as info, not error.
    return errors


def info_messages(merged):
    msgs = []
    dups = merged.get("_merge_info", {}).get("duplicate_pm_slugs")
    if dups:
        msgs.append(
            f"{len(dups)} intra-market slug collision(s) (seed.ts will append -2/-3 suffix): "
            f"{dups[:3]}{'...' if len(dups) > 3 else ''}"
        )
    return msgs


# ---------------------------------------------------------------------------
# Diff (human-readable)
# ---------------------------------------------------------------------------

def diff_summary(old, new):
    lines = []
    old_markets = {m["id"]: m for m in old.get("markets", [])}
    new_markets = {m["id"]: m for m in new.get("markets", [])}
    added = sorted(set(new_markets) - set(old_markets))
    removed = sorted(set(old_markets) - set(new_markets))
    kept = sorted(set(new_markets) & set(old_markets))

    lines.append(f"Markets:  {len(old_markets)} → {len(new_markets)}   (+{len(added)} / -{len(removed)})")
    for mid in added:
        m = new_markets[mid]
        lines.append(f"  + {mid:50s} {m.get('fullName', '?')}")
    for mid in removed:
        m = old_markets[mid]
        lines.append(f"  - {mid:50s} {m.get('fullName', '?')}")

    old_pms_by_market = Counter(pm["marketId"] for pm in old.get("pms", []))
    new_pms_by_market = Counter(pm["marketId"] for pm in new.get("pms", []))
    lines.append(f"PMs:      {sum(old_pms_by_market.values())} → {sum(new_pms_by_market.values())}")
    for mid in sorted(set(old_pms_by_market) | set(new_pms_by_market)):
        oc, nc = old_pms_by_market.get(mid, 0), new_pms_by_market.get(mid, 0)
        if oc != nc:
            marker = "  +" if mid not in old_markets else "   "
            lines.append(f"  {marker} {mid:50s} {oc} → {nc}")

    old_co = old.get("canonicalOperators", {})
    new_co = new.get("canonicalOperators", {})
    co_added = sorted(set(new_co) - set(old_co))
    co_removed = sorted(set(old_co) - set(new_co))
    co_changed = sorted(
        cid for cid in set(new_co) & set(old_co)
        if new_co[cid].get("marketCount") != old_co[cid].get("marketCount")
    )
    lines.append(
        f"Canonical operators: {len(old_co)} → {len(new_co)}   "
        f"(+{len(co_added)} / -{len(co_removed)} / ~{len(co_changed)})"
    )
    for cid in co_added[:10]:
        c = new_co[cid]
        lines.append(f"  + {cid:50s} {c.get('canonicalName', '?')} ({c.get('marketCount')} markets)")
    for cid in co_changed[:10]:
        o, n = old_co[cid], new_co[cid]
        lines.append(f"  ~ {cid:50s} markets {o.get('marketCount')} → {n.get('marketCount')}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Canonical proposal
# ---------------------------------------------------------------------------

def normalize_name(name):
    s = (name or "").lower().strip()
    s = re.sub(r"\b(llc|inc|corp|co|llp|ltd)\b\.?", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def propose_canonicals(merged, new_market_ids, baseline_canonical_path=None):
    """Find PMs in new markets whose normalized name matches a PM in
    another market. Returns a proposal dict for human review.

    Two flavors of proposal:
    1. extend_existing: new-market PM matches an existing canonical entity
       (e.g., Invitation Homes in Seattle should fold into the existing
       `invitation-homes` canonical operator).
    2. new_pair: new-market PM matches a single-market PM in another
       market that isn't canonicalized yet — create a NEW canonical entity.
    """
    new_market_ids = set(new_market_ids)
    pms = merged["pms"]

    # Index existing canonical entities by normalized name of their member PMs.
    existing_canonicals = merged.get("canonicalOperators", {})
    canonical_norm_index = {}
    for cid, c in existing_canonicals.items():
        canonical_norm_index[normalize_name(c.get("canonicalName", ""))] = cid

    # Group ALL PMs by normalized name.
    by_norm = defaultdict(list)
    for pm in pms:
        norm = normalize_name(pm["name"])
        if norm:
            by_norm[norm].append(pm)

    extend_existing = []
    new_pairs = []

    for norm, group in by_norm.items():
        market_ids_in_group = {pm["marketId"] for pm in group}
        new_markets_present = market_ids_in_group & new_market_ids
        if not new_markets_present:
            continue
        if len(market_ids_in_group) < 2:
            continue  # only one market hits this norm — nothing to canonicalize

        # Case 1: matches an existing canonical entity by normalized name.
        if norm in canonical_norm_index:
            existing_cid = canonical_norm_index[norm]
            existing = existing_canonicals[existing_cid]
            new_pms_to_add = [
                {"slug": pm["slug"], "name": pm["name"], "marketId": pm["marketId"]}
                for pm in group if pm["marketId"] in new_market_ids
            ]
            if new_pms_to_add:
                extend_existing.append({
                    "existing_canonical_slug": existing_cid,
                    "existing_canonical_name": existing["canonicalName"],
                    "currently_covers_markets": existing["marketIds"],
                    "currently_pm_count": existing["marketCount"],
                    "proposed_additions": new_pms_to_add,
                })
            continue

        # Case 2: new cross-market entity (multiple PMs share normalized
        # name, at least one is in a new market, none in existing canonicals).
        # Skip if all PMs are already in canonical mapping (would have hit
        # case 1).
        all_pm_canonical_ids = {pm.get("canonicalOperatorId") for pm in group}
        # If they already share a canonical id (i.e. canonicalization
        # already done upstream), skip.
        if len(all_pm_canonical_ids) == 1 and len(all_pm_canonical_ids - {pm["slug"] for pm in group}) > 0:
            continue
        new_pairs.append({
            "normalized_name": norm,
            "display_name": group[0]["name"],
            "members": [
                {"slug": pm["slug"], "name": pm["name"], "marketId": pm["marketId"]}
                for pm in group
            ],
        })

    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "new_market_ids": sorted(new_market_ids),
        "summary": {
            "extensions_to_existing_canonicals": len(extend_existing),
            "new_canonical_entity_candidates": len(new_pairs),
        },
        "extend_existing": extend_existing,
        "new_pairs": new_pairs,
        "_instructions": (
            "REVIEW THIS PROPOSAL BY HAND. Each entry under 'extend_existing' "
            "should fold the listed PMs into the existing canonical entity "
            "(verify they really are the same operator — Mapbox same-name "
            "false positives are common with generic names like 'Real Estate "
            "Group'). Each entry under 'new_pairs' creates a brand-new "
            "canonical entity — verify the name match isn't a coincidence "
            "across distinct operators. Once curated, fold the approved "
            "decisions into a new canonical_mapping_v064_p2_<N>markets.json "
            "and re-run merge.py --apply."
        ),
    }


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def snapshot_and_write(merged, target_path):
    if os.path.isfile(target_path):
        ts = time.strftime("%Y%m%dT%H%M%S")
        # v0.6.4 Patch 5 — backups go in a .backups/ subdirectory rather
        # than next to the source file, so the src/data/ folder doesn't
        # accumulate 27MB cruft files between merges. Still gitignored.
        backup_dir = os.path.join(os.path.dirname(target_path), ".backups")
        os.makedirs(backup_dir, exist_ok=True)
        backup_name = f"{os.path.basename(target_path)}.{ts}.bak"
        backup = os.path.join(backup_dir, backup_name)
        shutil.copyfile(target_path, backup)
        print(f"[merge] snapshot: {backup} ({os.path.getsize(backup):,} bytes)")
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    # Strip internal _merge_warnings before writing.
    out = {k: v for k, v in merged.items() if not k.startswith("_")}
    # v0.6.4 Patch 5 — minify the merged seed (drop indentation). The
    # file ballooned to 27MB at 15 markets; minification alone cuts
    # 43%. The trade-off is git line-diffs become uninformative on
    # the JSON, but at this size meaningful PR review reads merge.py's
    # diff_summary() output, not the JSON diff line by line.
    with open(target_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"[merge] wrote {target_path} ({os.path.getsize(target_path):,} bytes)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(
        description="v0.6.4 per-market → merged seed",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Build merged JSON in /tmp, print diff, exit. DEFAULT.")
    mode.add_argument("--apply", action="store_true", help="Snapshot target, write merged JSON in place.")
    mode.add_argument("--propose-canonicals", action="store_true", help="Generate canonical-mapping proposal JSON.")
    p.add_argument("--data-dir", default=None, help="Folder with per-market JSONs (default ~/Documents/Claude/Projects/Product Support)")
    p.add_argument("--registry", default=os.path.join(SCRIPT_DIR, "markets.json"))
    p.add_argument("--target", default=DEFAULT_TARGET, help="Path to scorecard_data.json")
    p.add_argument("--markets", default=None, help="Comma-separated market ids to merge (default: all from registry)")
    p.add_argument("--new-markets", default=None, help="(--propose-canonicals only) Comma-separated NEW market ids being analyzed")
    p.add_argument("--out", default=None, help="(--propose-canonicals only) Output path for proposal JSON")
    args = p.parse_args()

    # Default to --dry-run if no mode flag.
    if not (args.apply or args.propose_canonicals):
        args.dry_run = True

    data_dir = args.data_dir or os.environ.get("IQ_DATA_DIR") or DEFAULT_DATA_DIR
    if not os.path.isdir(data_dir):
        sys.exit(f"[merge] data-dir does not exist: {data_dir}")

    registry = load_registry(args.registry)
    market_subset = set((args.markets or "").split(",")) if args.markets else None
    markets_to_load = [
        m for m in registry["markets"]
        if market_subset is None or m["id"] in market_subset
    ]
    if not markets_to_load:
        sys.exit(f"[merge] no markets matched. Known: {[m['id'] for m in registry['markets']]}")

    print(f"[merge] loading {len(markets_to_load)} per-market JSONs from {data_dir}")
    per_market = []
    for m in markets_to_load:
        blob, path = load_per_market(data_dir, m["outputSlug"])
        per_market.append(blob)
        print(f"  ✓ {m['id']:50s} {os.path.basename(path)} ({len(blob.get('pms', []))} pms)")

    print(f"\n[merge] merging...")
    merged = merge_markets(per_market, registry.get("methodologyVersion", "v0.6.4"))

    errors = validate(merged)
    if errors:
        print(f"\n⚠  Validation errors ({len(errors)}):")
        for e in errors:
            print(f"   {e}")
        if args.apply:
            sys.exit("[merge] refusing to --apply with validation errors")
    else:
        print(f"[merge] validation: ✓ ({len(merged['markets'])} markets, "
              f"{len(merged['pms'])} pms, {len(merged['canonicalOperators'])} canonicals)")
    for msg in info_messages(merged):
        print(f"   ℹ  {msg}")

    if args.propose_canonicals:
        if not args.new_markets:
            sys.exit("[merge] --propose-canonicals requires --new-markets <ids>")
        new_market_ids = args.new_markets.split(",")
        proposal = propose_canonicals(merged, new_market_ids)
        out_path = args.out or f"/tmp/canonical_proposal_{int(time.time())}.json"
        with open(out_path, "w") as f:
            json.dump(proposal, f, indent=2)
        s = proposal["summary"]
        print(f"\n[merge] canonical proposal written: {out_path}")
        print(f"   Extensions to existing canonicals: {s['extensions_to_existing_canonicals']}")
        print(f"   New canonical entity candidates:   {s['new_canonical_entity_candidates']}")
        print(f"\n   Review by hand before applying.")
        return

    # Both --dry-run and --apply produce the merged JSON; only --apply writes
    # to the target. --dry-run also dumps to /tmp for inspection.
    if os.path.isfile(args.target):
        with open(args.target) as f:
            current = json.load(f)
    else:
        current = {"markets": [], "pms": [], "canonicalOperators": {}}

    print(f"\n[merge] diff vs current {os.path.relpath(args.target, REPO_ROOT)}:")
    print(diff_summary(current, merged))

    if args.dry_run:
        out_path = f"/tmp/scorecard_data.merged.{int(time.time())}.json"
        out = {k: v for k, v in merged.items() if not k.startswith("_")}
        with open(out_path, "w") as f:
            json.dump(out, f, indent=2)
        print(f"\n[merge] DRY-RUN — wrote merged JSON to {out_path} for inspection.")
        print(f"        Run with --apply to overwrite {os.path.relpath(args.target, REPO_ROOT)}.")
        return

    if args.apply:
        print(f"\n[merge] APPLYING — snapshotting and writing target.")
        snapshot_and_write(merged, args.target)
        print(f"\n[merge] done. Next: FORCE_SEED=true npx prisma db seed (locally) → commit + PR.")


if __name__ == "__main__":
    main()
