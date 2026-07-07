import unittest
from datetime import datetime, timedelta
from tenancy_survival import (
    is_departed, name_key, group_last_events, RECENCY_GATE_DAYS,
    build_observations, km_curve, retention_at, km_median, at_risk,
    compute_tenancy_survival, FLOOR_MONTHS, QUALIFY_MIN_ATRISK18, QUALIFY_MIN_EVENTS,
)

NOW = datetime(2026, 7, 6)
def days_ago(n): return NOW - timedelta(days=n)

class RecencyGate(unittest.TestCase):
    def test_departed_when_silent_past_gate(self):
        self.assertTrue(is_departed(days_ago(RECENCY_GATE_DAYS + 21), NOW))
    def test_active_within_gate(self):
        self.assertFalse(is_departed(days_ago(3), NOW))
    def test_boundary_exactly_at_gate_is_not_departed(self):
        self.assertFalse(is_departed(days_ago(RECENCY_GATE_DAYS), NOW))
    def test_none_last_event_is_departed(self):
        self.assertTrue(is_departed(None, NOW))

class NameLevelRecency(unittest.TestCase):
    def test_name_key_unites_casing_and_punctuation(self):
        self.assertEqual(name_key("Omega Realty Group"), name_key("omega realty group"))
        self.assertEqual(name_key("A.C.E., LLC"), name_key("ace llc"))
        self.assertNotEqual(name_key("RPM Victory"), name_key("RPM Key"))

    def test_group_last_events_takes_max_per_group(self):
        got = group_last_events([("omega", days_ago(177)), ("omega", days_ago(1)),
                                 ("omega", None), ("bridge", days_ago(80))])
        self.assertEqual(got["omega"], days_ago(1))   # active fragment wins
        self.assertEqual(got["bridge"], days_ago(80))

    def test_group_with_only_none_is_absent_then_departed(self):
        got = group_last_events([("ghost", None), ("ghost", None)])
        self.assertNotIn("ghost", got)
        self.assertTrue(is_departed(got.get("ghost"), NOW))  # absent -> departed

    def test_active_operator_with_stale_fragment_is_not_departed(self):
        # regression: Omega — an old child-id fragment (177d) + a live one (1d).
        # Name-level aggregation must keep the operator (fragment-level wrongly dropped it).
        by_name = group_last_events([
            (name_key("Omega Realty Group"), days_ago(177)),   # child-id 545103
            (name_key("Omega Realty Group"), days_ago(1)),     # child-id 915057 (active)
        ])
        self.assertFalse(is_departed(by_name[name_key("Omega Realty Group")], NOW))

    def test_fully_departed_operator_all_fragments_stale(self):
        # Bridge — every fragment stale -> departed at the name level.
        by_name = group_last_events([
            (name_key("Bridge Property Management"), days_ago(80)),
            (name_key("Bridge Property Management"), days_ago(120)),
        ])
        self.assertTrue(is_departed(by_name[name_key("Bridge Property Management")], NOW))

class BuildObservations(unittest.TestCase):
    def test_turnover_event_recorded(self):
        # unit listed, closed 800d ago, re-listed 700d ago -> ~3.3mo occupied gap = event
        eps = {"u": [(days_ago(900), days_ago(800)), (days_ago(700), days_ago(600))]}
        obs = build_observations(eps, NOW)
        self.assertIn(1, [e for _, e in obs])            # has a turnover event
        ev = [d for d, e in obs if e == 1][0]
        self.assertGreaterEqual(ev, FLOOR_MONTHS)

    def test_repost_below_floor_dropped(self):
        # closed then re-listed 30 days later -> < 3mo -> dropped (no event)
        eps = {"u": [(days_ago(400), days_ago(300)), (days_ago(270), None)]}
        obs = build_observations(eps, NOW)
        self.assertEqual([e for _, e in obs if e == 1], [])   # no turnover event

    def test_still_occupied_is_censored(self):
        # single listing closed 300d ago, never re-listed -> censored obs (~9.9mo)
        eps = {"u": [(days_ago(500), days_ago(300))]}
        obs = build_observations(eps, NOW)
        self.assertEqual(len(obs), 1)
        dur, event = obs[0]
        self.assertEqual(event, 0)
        self.assertAlmostEqual(dur, 300 / 30.44, places=1)

    def test_open_listing_yields_no_observation(self):
        # last listing still open (deactivation None) -> on-market, no observation
        eps = {"u": [(days_ago(100), None)]}
        self.assertEqual(build_observations(eps, NOW), [])

class KMEstimator(unittest.TestCase):
    def test_retention_monotonic_and_bounded(self):
        obs = [(6, 1), (12, 1), (30, 0), (40, 0), (48, 0)]
        curve = km_curve(obs)
        r12, r24 = retention_at(curve, 12), retention_at(curve, 24)
        self.assertLessEqual(r24, r12)
        self.assertTrue(0.0 <= r24 <= 1.0)

    def test_no_events_gives_full_retention(self):
        obs = [(30, 0), (40, 0)]                 # all censored, no turnover
        self.assertEqual(retention_at(km_curve(obs), 24), 1.0)

    def test_at_risk_counts_observations_past_horizon(self):
        obs = [(10, 1), (25, 0), (30, 1), (40, 0)]
        self.assertEqual(at_risk(obs, 24), 3)    # 25, 30, 40 are >= 24

    def test_km_median_none_when_never_crosses_half(self):
        obs = [(30, 0)] * 10                      # never drops below 0.5
        self.assertIsNone(km_median(km_curve(obs)))

class ComputeTenancySurvival(unittest.TestCase):
    def _sticky_units(self, n, occupied_days=800):
        # n units each closed occupied_days ago, never re-listed -> n censored obs past 18mo
        return {f"u{i}": [(days_ago(occupied_days + 200), days_ago(occupied_days))] for i in range(n)}

    def test_unqualified_when_too_few_at_risk(self):
        out = compute_tenancy_survival(self._sticky_units(QUALIFY_MIN_ATRISK18 - 1), NOW)
        self.assertFalse(out["tenancyQualified"])
        self.assertIsNone(out["retention18Pct"])
        self.assertTrue(out["tenancySuppressed"])

    def test_unqualified_when_too_few_events(self):
        # 40 censored units past 18mo (at-risk ok) but 0 turnover events -> min-events gate fails
        out = compute_tenancy_survival(self._sticky_units(40), NOW)
        self.assertGreaterEqual(out["atRisk18"], QUALIFY_MIN_ATRISK18)
        self.assertEqual(out["turnoverEvents"], 0)
        self.assertFalse(out["tenancyQualified"])
        self.assertIsNone(out["retention18Pct"])

    def test_qualified_emits_retention(self):
        units = {}
        # 30 units that turned over at ~30 months (event), plus 30 still-occupied past 18mo
        for i in range(30):
            units[f"t{i}"] = [(days_ago(1100), days_ago(1000)), (days_ago(90), None)]
        for i in range(30):
            units[f"c{i}"] = [(days_ago(900), days_ago(800))]
        out = compute_tenancy_survival(units, NOW)
        self.assertTrue(out["tenancyQualified"])
        self.assertIsNotNone(out["retention18Pct"])
        self.assertGreaterEqual(out["turnoverEvents"], QUALIFY_MIN_EVENTS)
        self.assertEqual(set(out["retentionCurve"]), {"m12", "m18", "m24"})

if __name__ == "__main__":
    unittest.main()
