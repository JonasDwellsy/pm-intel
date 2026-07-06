import unittest
from datetime import datetime, timedelta
from tenancy_survival import is_departed, RECENCY_GATE_DAYS

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

if __name__ == "__main__":
    unittest.main()
