#!/usr/bin/env python3
"""Normalize acronyms / initialisms in PM display names.

The Dwellsy source CSV title-cases company names before they reach our
pipeline ('PMI Mile High' → 'Pmi Mile High'). This script restores
canonical acronym capitalization in the per-market JSONs.

Three rules (applied in order, last wins):

  1. ALLOWLIST — pm_name_acronyms.json. Case-insensitive token match,
     restores the canonical casing from the list. Zero false positives.

  2. 2-CHAR AUTO-UPPER — any 2-character all-letter token gets
     uppercased. 'Wh' → 'WH', 'Pm' → 'PM'. High confidence — 2-letter
     English words are vanishingly rare in PM names ('My', 'In', 'Of'
     are stopwords that don't show up at the start of operator names).

  3. PER-PM OVERRIDES — canonical_decisions_*.json files can carry an
     optional `nameOverrides` block that maps pm_slug → corrected
     display name. Wins over both heuristics above; useful for one-off
     edge cases the rules don't catch.

Usage:
    # Default dry-run mode — show planned changes, don't write:
    python normalize_pm_names.py

    # Apply changes (snapshots each per-market JSON before write):
    python normalize_pm_names.py --apply

    # Apply to a specific market only:
    python normalize_pm_names.py --apply --markets denver-co

Idempotent — re-running on already-normalized data is a no-op.
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


def load_acronyms(path):
    with open(path) as f:
        data = json.load(f)
    return data["acronyms"], set(data.get("stopwords_2char", []))


def normalize_token(token, acronym_map, stopwords_2char):
    """Apply the allowlist + 2-char heuristic to a single token.

    Returns the corrected casing of the token (or the input unchanged
    if no rule fires).
    """
    if not token:
        return token
    # Only consider pure-letter tokens for normalization. Tokens with
    # punctuation (like 'LLC,' or 'L.P.') pass through; the allowlist
    # handles the bare forms ('LLC' → 'LLC') and the comma/period
    # before/after is preserved by being part of a different token after
    # the split (e.g., 'Foo, LLC' splits to ['Foo,', 'LLC']).
    if not token.isalpha():
        return token
    upper = token.upper()
    # Rule 1: allowlist match (case-insensitive). Allowlist always
    # wins, even against stopwords — if someone explicitly listed a
    # word as an acronym, respect it.
    if upper in acronym_map:
        return acronym_map[upper]
    # Rule 2: 2-char all-letter token → uppercase, UNLESS it's a
    # known 2-letter English word (the stopwords list). State codes
    # that happen to also be English words (IN, OR, OK, ME, HI, NO)
    # default to staying lowercase per the stopwords; use the
    # per-PM override mechanism for the rare state-code-in-name case.
    if len(token) == 2 and token.lower() not in stopwords_2char:
        return upper
    return token


def normalize_name(name, acronym_map, stopwords_2char, override=None):
    """Apply normalization to a full PM display name.

    Splits on whitespace, normalizes each token, rejoins. Punctuation
    inside a token (commas, periods, parens) is left alone because
    such tokens are skipped by the per-token rule. Override (when
    provided) short-circuits the whole pipeline.
    """
    if override is not None:
        return override
    if not name:
        return name
    tokens = name.split(" ")
    return " ".join(normalize_token(t, acronym_map, stopwords_2char) for t in tokens)


def build_acronym_map(acronyms):
    """Build {UPPER_TOKEN: canonical_casing} from the allowlist."""
    return {a.upper(): a for a in acronyms}


def collect_overrides(decisions_paths):
    """Walk canonical_decisions_*.json files and extract any
    nameOverrides blocks. Returns {pm_slug: corrected_name}."""
    overrides = {}
    for p in decisions_paths:
        try:
            with open(p) as f:
                data = json.load(f)
        except (IOError, json.JSONDecodeError):
            continue
        no = data.get("nameOverrides") or {}
        for slug, name in no.items():
            overrides[slug] = name
    return overrides


def load_registry(path):
    with open(path) as f:
        return json.load(f)


def main():
    p = argparse.ArgumentParser(
        description="Normalize PM display-name acronyms in per-market JSONs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--acronyms",
        default=os.path.join(SCRIPT_DIR, "pm_name_acronyms.json"),
    )
    p.add_argument(
        "--registry",
        default=os.path.join(SCRIPT_DIR, "markets.json"),
    )
    p.add_argument(
        "--data-dir",
        default=None,
        help="Folder with per-market JSONs (default $IQ_DATA_DIR or ~/Documents/Claude/Projects/Product Support)",
    )
    p.add_argument(
        "--markets",
        default=None,
        help="Comma-separated market ids to process (default: all from registry)",
    )
    p.add_argument(
        "--apply",
        action="store_true",
        help="Write changes in place (default is dry-run).",
    )
    args = p.parse_args()

    data_dir = args.data_dir or os.environ.get("IQ_DATA_DIR") or DEFAULT_DATA_DIR
    if not os.path.isdir(data_dir):
        sys.exit(f"[normalize_pm_names] data-dir does not exist: {data_dir}")

    acronyms, stopwords_2char = load_acronyms(args.acronyms)
    acronym_map = build_acronym_map(acronyms)
    print(f"[normalize_pm_names] loaded {len(acronyms)} acronyms + "
          f"{len(stopwords_2char)} 2-char stopwords")

    # Collect any nameOverrides from all canonical_decisions files.
    decisions_paths = [
        os.path.join(SCRIPT_DIR, f)
        for f in os.listdir(SCRIPT_DIR)
        if f.startswith("canonical_decisions_") and f.endswith(".json")
    ]
    overrides = collect_overrides(decisions_paths)
    if overrides:
        print(f"[normalize_pm_names] loaded {len(overrides)} per-PM overrides from "
              f"{len(decisions_paths)} canonical_decisions file(s)")

    registry = load_registry(args.registry)
    market_subset = set((args.markets or "").split(",")) if args.markets else None
    markets_to_process = [
        m for m in registry["markets"]
        if market_subset is None or m["id"] in market_subset
    ]

    # Per-market changes plan
    total_changes = 0
    per_market_changes = defaultdict(list)
    files_to_edit = []
    for m in markets_to_process:
        path = os.path.join(
            data_dir,
            f"Scorecard_Data_v0.6.4_{m['outputSlug']}.json",
        )
        if not os.path.isfile(path):
            print(f"  ! {m['id']:50s} missing per-market JSON, skipping")
            continue
        with open(path) as f:
            blob = json.load(f)
        market_changes = []
        for pm in blob.get("pms", []):
            old_name = pm.get("name", "")
            override = overrides.get(pm.get("slug"))
            new_name = normalize_name(old_name, acronym_map, stopwords_2char, override)
            # Also normalize canonicalOperatorName if present, since
            # render code falls back to it for the DBA case.
            old_canonical_name = pm.get("canonicalOperatorName") or ""
            new_canonical_name = normalize_name(old_canonical_name, acronym_map, stopwords_2char)
            if new_name != old_name or new_canonical_name != old_canonical_name:
                market_changes.append({
                    "slug": pm.get("slug"),
                    "name_before": old_name,
                    "name_after": new_name,
                    "canonical_before": old_canonical_name,
                    "canonical_after": new_canonical_name,
                })
        if market_changes:
            per_market_changes[m["id"]] = market_changes
            files_to_edit.append((m, path, blob, market_changes))
            total_changes += len(market_changes)

    print(f"\n[normalize_pm_names] planned: {total_changes} PM rename(s) across "
          f"{len(per_market_changes)} market(s)")
    for mid, changes in per_market_changes.items():
        print(f"  {mid:50s} {len(changes)} change(s)")

    if not args.apply:
        # Dry-run: show first 30 changes
        print(f"\n[normalize_pm_names] DRY-RUN — first 30 changes:")
        shown = 0
        for changes in per_market_changes.values():
            for c in changes:
                if shown >= 30: break
                if c["name_before"] != c["name_after"]:
                    print(f"  {c['slug']:55s} "
                          f"{c['name_before']!r:42s} → {c['name_after']!r}")
                shown += 1
            if shown >= 30: break
        if total_changes > 30:
            print(f"  ... and {total_changes - 30} more")
        print(f"\n[normalize_pm_names] Run with --apply to write changes.")
        return

    # Apply: snapshot + write each file
    ts = time.strftime("%Y%m%dT%H%M%S")
    for m, path, blob, market_changes in files_to_edit:
        backup = f"{path}.{ts}.bak"
        shutil.copyfile(path, backup)
        # Apply changes to the in-memory blob
        change_index = {c["slug"]: c for c in market_changes}
        for pm in blob.get("pms", []):
            slug = pm.get("slug")
            if slug in change_index:
                c = change_index[slug]
                pm["name"] = c["name_after"]
                if pm.get("canonicalOperatorName"):
                    pm["canonicalOperatorName"] = c["canonical_after"]
        with open(path, "w") as f:
            json.dump(blob, f, indent=2)
        print(f"  ✓ {m['id']:50s} {len(market_changes)} change(s) → "
              f"backup: {os.path.basename(backup)}")

    print(f"\n[normalize_pm_names] done. Next: python merge.py to dry-run, then --apply.")


if __name__ == "__main__":
    main()
