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
