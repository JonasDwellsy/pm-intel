import unittest
from datetime import datetime, timedelta
from tenancy_survival import (
    is_departed, name_key, group_last_events, RECENCY_GATE_DAYS,
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

if __name__ == "__main__":
    unittest.main()
