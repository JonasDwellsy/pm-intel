#!/usr/bin/env python3
"""Pure within-market operator grouping key (Phase 1 fragment merge).

The source issues the same operator new child_company_ids over time (batch-era
churn), which the pipeline previously keyed as separate fragments. We group
no-parent operators by normalized name so those fragments pool into one
operator. Parent-linked operators keep parent-id grouping ("parent rules").
See docs/superpowers/specs/2026-07-06-within-market-fragment-merge-design.md.
"""

import json
import os
import re
from tenancy_survival import name_key

# Null/placeholder company names carry no operator identity — the source uses
# them when a listing has no company. Name-merging them would pool unrelated
# listings into a fabricated ranked operator (e.g. "Company Name Not Provided"),
# so we never merge on these; each stays child-id-keyed (sub-eligible).
PLACEHOLDER_NAME_KEYS = frozenset({
    "companynamenotprovided", "namenotprovided", "notprovided",
    "nocompanyname", "notavailable", "unknown",
})

# Verbatim from src/lib/operators/merge-candidates.ts so the pipeline auto-merge,
# the merge tool, and the sub-eligible sidecar all normalize names identically.
LEGAL_SUFFIXES = frozenset({
    "inc", "llc", "llp", "lp", "ltd", "co", "corp", "corporation", "company",
})
GENERIC_TOKENS = frozenset({
    "property", "properties", "management", "mgmt", "realty", "real", "estate",
    "group", "homes", "home", "rentals", "rental", "services", "service",
    "the", "of", "and",
})


def strong_name_key(name):
    """Lowercase, non-alnum -> space, drop legal-suffix tokens, join with space.
    ASCII-only ([^a-z0-9]+) — matches TS normalizeOperatorName, and closes the
    latent accented-char name_key parity gap on the auto-merge path. Falls back
    to the space-normed string if every token is a legal suffix."""
    s = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    toks = [t for t in s.split(" ") if t and t not in LEGAL_SUFFIXES]
    return " ".join(toks) or s


def is_distinctive(strong_norm):
    """>=2 tokens AND >=1 token outside GENERIC_TOKENS (the merge tool's
    _distinctive_set). Purely-generic or single-token names never auto-merge."""
    toks = [t for t in strong_norm.split(" ") if t]
    return len(toks) >= 2 and any(t not in GENERIC_TOKENS for t in toks)


def _legal_suffix_count(name):
    """Number of legal-suffix tokens in a raw name (used to pick the cleanest
    display variant — 'X' beats 'X LLC')."""
    toks = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).split()
    return sum(1 for t in toks if t in LEGAL_SUFFIXES)


def within_market_key(parent_id, child_id, name, market_id, do_not_merge, merge_map=None):
    """Return the within-market grouping key for one operator row.

    parent_id present            -> the parent id (parent rules), UNLESS a
                                    curated merge_map remaps that parent id onto
                                    a survivor (folding a parent-keyed operator
                                    into a curated merge).
    no parent, name available    -> f"name:{name_key(name)}" (merge same-name
                                    fragments) UNLESS (market_id, name_key) is
                                    on the do-not-merge list, in which case keep
                                    the child id (stay fragmented). If a curated
                                    merge_map has an entry for (market_id,
                                    "name:{name_key}"), remap to its survivorKey
                                    instead.
    no parent, placeholder/blank -> the child id (never merge null-name rows).
    no parent, no usable name    -> the child id (or "" if none)."""
    pid = (parent_id or "").strip()
    if pid:
        # Parent-linked operators key by parent id, but a curated merge_map may
        # remap that parent-id key onto a survivor (e.g. folding a no-parent
        # "X LLC" fragment into a parent-keyed "X"). Consult it here too, not
        # only in the name-key branch below.
        if merge_map:
            info = merge_map.get((market_id, pid))
            if info:
                return info["survivorKey"]
        return pid
    cid = (child_id or "").strip()
    nkey = name_key(name)
    if not nkey or nkey in PLACEHOLDER_NAME_KEYS:
        return cid
    if (market_id, nkey) in do_not_merge:
        return cid or f"name:{nkey}"
    base = f"name:{nkey}"
    if merge_map:
        info = merge_map.get((market_id, base))
        if info:
            return info["survivorKey"]
    return base


def load_do_not_merge(path):
    """Load do_not_merge.json -> set of (marketId, normalizedName). Missing file
    or empty list -> empty set (the launch state — nothing denylisted)."""
    if not os.path.isfile(path):
        return set()
    with open(path) as f:
        rows = json.load(f)
    return {(r["marketId"], r["normalizedName"]) for r in rows}


def load_merge_decisions(path):
    """Load merge_decisions.json -> {(marketId, memberKey): {survivorKey, canonicalName,
    survivorSlug}}. survivorKey is itself a member (maps to itself)."""
    if not os.path.isfile(path):
        return {}
    with open(path) as f:
        data = json.load(f)
    out = {}
    for d in data.get("decisions", []):
        info = {"survivorKey": d["survivorKey"], "canonicalName": d["canonicalName"],
                "survivorSlug": d["survivorSlug"]}
        for mk in d["memberKeys"]:
            out[(d["marketId"], mk)] = info
    return out


def merged_override(market_id, key, merge_map):
    """If `key` is a merged SURVIVOR key in this market, return its
    {canonicalName, survivorSlug}; else None."""
    if not merge_map:
        return None
    info = merge_map.get((market_id, key))
    if info and info["survivorKey"] == key:
        return {"canonicalName": info["canonicalName"], "survivorSlug": info["survivorSlug"]}
    return None
