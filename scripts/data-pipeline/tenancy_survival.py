#!/usr/bin/env python3
"""Pure helpers for the tenancy metric redesign. No side effects / no argv / no
I/O — safe to import from pipeline.py and unit tests. This PR adds the
departed-operator recency predicate AND the Kaplan-Meier survival math.
See docs/superpowers/specs/2026-07-06-tenancy-retention-redesign-design.md (§4.5).

KM model: each unit's OCCUPIED interval between two listings is a tenancy.
  event (turnover)   = next_creation - prev_deactivation  (>= FLOOR_MONTHS)
  right-censored     = now - last_deactivation            (still occupied)
Kaplan-Meier over events + censored obs -> S(t) = P(tenancy lasts >= t months).
Ranked metric = S(18). Qualify only when enough units reached 18 months AND
there are real turnover events (guards a frozen-inventory snapshot).
"""

MONTH_DAYS = 30.44
FLOOR_MONTHS = 3.0
QUALIFY_MIN_ATRISK18 = 25
QUALIFY_MIN_EVENTS = 5
# Raised 60 -> 90 (2026-08-07, dormant-operator tier). At 60 days a 73-operator
# band (median 58 T12 listings) was being dropped for ordinary cadence gaps
# rather than genuine dormancy — and the rule perversely punished retention,
# since an operator with few turnovers lists rarely. Operators past this gate
# are no longer deleted; they are classified `dormant` and kept with an
# explicit last-listing date (see pipeline.py's ranked/dormant split).
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


def build_observations(episodes_by_unit, now):
    """episodes_by_unit: {unit_id: [(creation_dt, deactivation_dt|None), ...]}.
    Returns pooled [(duration_months, event)] across all units. event=1 turnover,
    0 right-censored. Re-post intervals (< FLOOR_MONTHS) are dropped entirely."""
    obs = []
    for eps in episodes_by_unit.values():
        eps = sorted(eps, key=lambda x: x[0])
        for i in range(1, len(eps)):
            prev_deact = eps[i - 1][1]
            curr_creation = eps[i][0]
            if prev_deact and curr_creation and curr_creation > prev_deact:
                dur = (curr_creation - prev_deact).days / MONTH_DAYS
                if dur >= FLOOR_MONTHS:
                    obs.append((dur, 1))
        last_deact = eps[-1][1] if eps else None
        if last_deact:
            dur = (now - last_deact).days / MONTH_DAYS
            if dur >= 0:
                obs.append((dur, 0))
    return obs


def km_curve(observations):
    """Kaplan-Meier product-limit estimator. Returns [(t, S(t))] at event times."""
    event_times = sorted(set(t for t, e in observations if e == 1))
    S = 1.0
    curve = []
    for t in event_times:
        n_at_risk = sum(1 for d, _ in observations if d >= t)
        n_events = sum(1 for d, e in observations if e == 1 and abs(d - t) < 1e-9)
        if n_at_risk > 0:
            S *= (1 - n_events / n_at_risk)
        curve.append((t, S))
    return curve


def retention_at(curve, h):
    """S(h): the last S at an event time <= h; 1.0 if no event <= h."""
    s = 1.0
    for t, sv in curve:
        if t <= h:
            s = sv
        else:
            break
    return s


def km_median(curve):
    """First t where S(t) <= 0.5; None if the curve never crosses 0.5 in-window."""
    return next((t for t, sv in curve if sv <= 0.5), None)


def at_risk(observations, h):
    """# observations (event or censored) lasting >= h months."""
    return sum(1 for d, _ in observations if d >= h)


def compute_tenancy_survival(episodes_by_unit, now):
    """Full derived tenancy-survival block for one operator."""
    obs = build_observations(episodes_by_unit, now)
    curve = km_curve(obs)
    r12 = round(retention_at(curve, 12) * 100, 1)
    r18 = round(retention_at(curve, 18) * 100, 1)
    r24 = round(retention_at(curve, 24) * 100, 1)
    km_med = km_median(curve)
    ar18 = at_risk(obs, 18)
    events = sum(1 for _, e in obs if e == 1)
    qualified = ar18 >= QUALIFY_MIN_ATRISK18 and events >= QUALIFY_MIN_EVENTS
    return {
        "retention18Pct": r18 if qualified else None,
        "retentionCurve": {"m12": r12, "m18": r18, "m24": r24},
        "kmMedianMonths": round(km_med, 1) if km_med is not None else None,
        "atRisk18": ar18,
        "turnoverEvents": events,
        "tenancyQualified": qualified,
        "tenancySuppressed": not qualified,
    }
