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


def compute_auto_merges(rows, market_id, do_not_merge):
    """Exact-tier auto-merges for one market. rows: iterable of dicts with keys
    parent_id, child_id, name (the market's post-exclusion operator rows).
    Returns a deterministic list of cluster dicts:
      {strong, survivorKey, canonicalName, survivorSlug,
       members: [{key, name, had_parent}]}
    No metrics/listings needed. within_market_key (map-free) is the mergeability
    oracle: a no-parent row whose natural key is a bare child id was deliberately
    kept unpooled (placeholder or name_key-denylisted) and is never a candidate."""
    by_key = {}  # base_key -> {"had_parent", "name" (cleanest seen), "strong"}
    for r in rows:
        pid = (r.get("parent_id") or "").strip()
        cid = (r.get("child_id") or "").strip()
        nm = r.get("name") or ""
        base = within_market_key(pid, cid, nm, market_id, do_not_merge, None)
        had_parent = bool(pid)
        if not had_parent and not base.startswith("name:"):
            continue  # placeholder / denylisted -> not a merge candidate
        strong = strong_name_key(nm)
        cur = by_key.get(base)
        cand = (_legal_suffix_count(nm), nm.lower())
        if cur is None or cand < (_legal_suffix_count(cur["name"]), cur["name"].lower()):
            by_key[base] = {"had_parent": had_parent, "name": nm, "strong": strong}
    by_strong = {}
    for base, info in by_key.items():
        by_strong.setdefault(info["strong"], []).append((base, info))
    clusters = []
    for strong, members in by_strong.items():
        if len(members) < 2:
            continue
        if not is_distinctive(strong):
            continue
        if (market_id, strong) in do_not_merge:
            continue
        canon_base, canon_info = min(
            members, key=lambda bi: (_legal_suffix_count(bi[1]["name"]), bi[1]["name"].lower()))
        parent_keys = [b for b, i in members if i["had_parent"]]
        if parent_keys:
            survivor_key = sorted(
                parent_keys, key=lambda k: (0, int(k)) if k.isdigit() else (1, k))[0]
        else:
            survivor_key = canon_base
        canonical_name = canon_info["name"]
        survivor_slug = re.sub(r"[^a-z0-9]+", "-", canonical_name.lower()).strip("-") + f"-{market_id}"
        clusters.append({
            "strong": strong,
            "survivorKey": survivor_key,
            "canonicalName": canonical_name,
            "survivorSlug": survivor_slug,
            "members": [{"key": b, "name": i["name"], "had_parent": i["had_parent"]}
                        for b, i in sorted(members)],
        })
    clusters.sort(key=lambda c: c["canonicalName"].lower())
    return clusters


def auto_merge_map(clusters, market_id):
    """clusters (from compute_auto_merges) -> {(market_id, memberKey): {survivorKey,
    canonicalName, survivorSlug}}, survivor mapping to itself — the exact shape
    within_market_key / merged_override consume from load_merge_decisions."""
    out = {}
    for c in clusters:
        info = {"survivorKey": c["survivorKey"], "canonicalName": c["canonicalName"],
                "survivorSlug": c["survivorSlug"]}
        keys = {m["key"] for m in c["members"]} | {c["survivorKey"]}
        for k in keys:
            out[(market_id, k)] = info
    return out


def assert_auto_merge_invariants(clusters, market_id, do_not_merge):
    """Fail loudly if any auto-merge cluster is structurally unsafe. Runs on every
    pipeline invocation before the map is applied."""
    seen_member = {}
    seen_slug = {}
    for c in clusters:
        assert is_distinctive(c["strong"]), f"non-distinctive auto-merge: {c['strong']!r}"
        assert (market_id, c["strong"]) not in do_not_merge, f"vetoed auto-merge emitted: {c['strong']!r}"
        keys = [m["key"] for m in c["members"]]
        assert len(keys) >= 2, f"degenerate cluster: {c['strong']!r}"
        assert len(set(keys)) == len(keys), f"duplicate member key: {c['strong']!r}"
        assert c["survivorKey"] in keys, f"survivor not a member: {c['strong']!r}"
        for k in keys:
            assert k not in seen_member or seen_member[k] == c["strong"], \
                f"member {k!r} spans two strong-norms"
            seen_member[k] = c["strong"]
        assert c["survivorSlug"] not in seen_slug or seen_slug[c["survivorSlug"]] == c["survivorKey"], \
            f"survivor slug collision: {c['survivorSlug']!r}"
        seen_slug[c["survivorSlug"]] = c["survivorKey"]


def format_auto_merge_report(clusters, market_id):
    """Human sign-off report: one block per auto-merge, with the exact
    do_not_merge veto string to paste to reject it."""
    lines = [f"# auto-merge report — {market_id} — {len(clusters)} cluster(s)"]
    for c in clusters:
        members = ", ".join(f"{m['name']!r}[{m['key']}]" for m in c["members"])
        lines.append(f"{c['canonicalName']!r}  (survivor {c['survivorKey']})  <-  {members}")
        lines.append(f'    veto: add {{"marketId":"{market_id}","normalizedName":"{c["strong"]}"}} to do_not_merge.json')
    return "\n".join(lines) + "\n"


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
