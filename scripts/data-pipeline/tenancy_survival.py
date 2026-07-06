#!/usr/bin/env python3
"""Pure helpers for the tenancy metric redesign. No side effects / no argv / no
I/O — safe to import from pipeline.py and unit tests. This PR adds only the
departed-operator recency predicate; the Kaplan-Meier survival math lands in a
later PR. See docs/superpowers/specs/2026-07-06-tenancy-retention-redesign-design.md (§4.5).
"""

RECENCY_GATE_DAYS = 60


def is_departed(last_event_dt, now, gate_days=RECENCY_GATE_DAYS):
    """True if the operator's most recent listing event (creation or
    deactivation) is older than gate_days before `now`, or there is none.
    Departed operators are excluded from the ranked set entirely."""
    if last_event_dt is None:
        return True
    return (now - last_event_dt).days > gate_days


def name_key(name):
    """Canonical grouping key for uniting an operator's within-market fragments.

    Within a market the same operator can appear under several `child_company_id`
    values over time (the source churns child ids), which the pipeline keys as
    separate fragments. They share one display name, so we judge departure at the
    NAME level — otherwise a stale old-child-id fragment of a still-active
    operator would be wrongly dropped by the recency gate."""
    return "".join(c.lower() for c in (name or "") if c.isalnum())


def group_last_events(items):
    """items: iterable of (group_key, last_event_dt|None). Returns
    {group_key: most-recent last_event_dt across the group}. None entries are
    ignored; a group with only None entries is absent from the result (so the
    recency gate treats it as departed, matching is_departed(None))."""
    out = {}
    for key, le in items:
        if le is None:
            continue
        cur = out.get(key)
        if cur is None or le > cur:
            out[key] = le
    return out
