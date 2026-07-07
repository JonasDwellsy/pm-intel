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
from tenancy_survival import name_key


def within_market_key(parent_id, child_id, name, market_id, do_not_merge):
    """Return the within-market grouping key for one operator row.

    parent_id present            -> the parent id (parent rules; unchanged).
    no parent, name available    -> f"name:{name_key(name)}" (merge same-name
                                    fragments) UNLESS (market_id, name_key) is
                                    on the do-not-merge list, in which case keep
                                    the child id (stay fragmented).
    no parent, no usable name    -> the child id (or "" if none)."""
    pid = (parent_id or "").strip()
    if pid:
        return pid
    cid = (child_id or "").strip()
    nkey = name_key(name)
    if not nkey:
        return cid
    if (market_id, nkey) in do_not_merge:
        return cid or f"name:{nkey}"
    return f"name:{nkey}"


def load_do_not_merge(path):
    """Load do_not_merge.json -> set of (marketId, normalizedName). Missing file
    or empty list -> empty set (the launch state — nothing denylisted)."""
    if not os.path.isfile(path):
        return set()
    with open(path) as f:
        rows = json.load(f)
    return {(r["marketId"], r["normalizedName"]) for r in rows}
