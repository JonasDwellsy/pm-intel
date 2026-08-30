"""Tests for the national marketing-cohort distribution.

The cohort file is the input that de-biases Marketing Discipline stars, so the
things worth pinning are its POPULATION (who counts as a peer) and its
USABILITY (is each cell a real distribution). Getting either wrong reintroduces
the defect silently — the pipeline would still run and still emit stars.
"""

import json
import os
import unittest

from build_marketing_cohorts import build, MIN_COHORT_N, DEFAULT_OUT


def _seed(pms, version="v0.7", as_of="2026-08-20"):
    return {"methodologyVersion": version, "dataAsOf": as_of, "pms": pms}


def _pm(slug, q7, score, operator_type="pm", status="active"):
    return {"slug": slug, "quadrant7Cell": q7, "operatorType": operator_type,
            "operatorStatus": status, "marketing": {"compositeScore": score}}


class Population(unittest.TestCase):
    """The national cohort must contain exactly the operators the LOCAL cohort
    would contain, or the two levels of the same ladder disagree about who a
    peer is."""

    def test_brokers_are_excluded(self):
        # cohort_members filters on operator_type: a PM is only ranked against
        # PMs. A broker leaking into the national pool would shift every PM's
        # marketing percentile.
        seed = _seed([_pm("a", "SFR Independent", 50),
                      _pm("b", "SFR Independent", 90, operator_type="broker")])
        cohorts, skipped, _, _ = _build_from(seed)
        self.assertEqual(cohorts["SFR Independent"], [50.0])
        self.assertEqual(skipped.get("broker"), 1)

    def test_dormant_operators_are_excluded(self):
        # v0.8 rule: dormant operators are measured AGAINST a cohort but never
        # contribute to it, so one operator going quiet can't move another's
        # percentile. The national pool has to honour that too.
        seed = _seed([_pm("a", "SFR Independent", 50),
                      _pm("b", "SFR Independent", 90, status="dormant")])
        cohorts, skipped, _, _ = _build_from(seed)
        self.assertEqual(cohorts["SFR Independent"], [50.0])
        self.assertEqual(skipped.get("dormant"), 1)

    def test_missing_score_or_cell_is_skipped_not_zeroed(self):
        # A missing composite must not enter as 0.0 — that would drag the whole
        # cell's distribution down and inflate everyone else's percentile.
        seed = _seed([
            _pm("a", "SFR Independent", 50),
            {"slug": "b", "quadrant7Cell": "SFR Independent", "operatorType": "pm",
             "operatorStatus": "active", "marketing": {}},
            {"slug": "c", "operatorType": "pm", "operatorStatus": "active",
             "marketing": {"compositeScore": 99}},
        ])
        cohorts, skipped, _, _ = _build_from(seed)
        self.assertEqual(cohorts["SFR Independent"], [50.0])
        self.assertEqual(skipped.get("no q7 or score"), 2)

    def test_scores_are_sorted(self):
        # percentile_rank assumes a sorted distribution.
        seed = _seed([_pm(str(i), "SFR Independent", s) for i, s in enumerate([70, 10, 50])])
        cohorts, _, _, _ = _build_from(seed)
        self.assertEqual(cohorts["SFR Independent"], [10.0, 50.0, 70.0])


class ShippedFile(unittest.TestCase):
    """Guards on the committed distribution the pipeline actually reads."""

    @classmethod
    def setUpClass(cls):
        with open(DEFAULT_OUT) as f:
            cls.payload = json.load(f)
        cls.cohorts = cls.payload["cohorts"]

    def test_every_cell_is_a_usable_distribution(self):
        # Below MIN_COHORT_N the consumer falls through instead of scoring, so
        # a small cell silently reverts that operator to the old broken
        # fallback. All seven cells should clear it comfortably.
        small = {k: len(v) for k, v in self.cohorts.items() if len(v) < MIN_COHORT_N}
        self.assertEqual(small, {}, f"cells below MIN_COHORT_N={MIN_COHORT_N}: {small}")

    def test_covers_all_seven_cells(self):
        self.assertEqual(len(self.cohorts), 7, sorted(self.cohorts))

    def test_scores_are_sorted_and_in_range(self):
        for cell, vals in self.cohorts.items():
            self.assertEqual(vals, sorted(vals), f"{cell} not sorted")
            self.assertTrue(all(0 <= v <= 100 for v in vals), f"{cell} out of range")

    def test_carries_provenance(self):
        # A stale distribution silently mis-scores everyone, so the file has to
        # say which seed it came from.
        for k in ("methodologyVersion", "dataAsOf", "generatedFromSeed", "minCohortN"):
            self.assertIsNotNone(self.payload.get(k), k)

    def test_institutional_cells_really_do_score_higher(self):
        # The premise of the whole fix. If this ever stops holding, the
        # confound is gone and the national fallback is no longer needed.
        def med(cell):
            v = self.cohorts[cell]
            return v[len(v) // 2]
        self.assertGreater(med("Large MF/BTR Institutional"), med("Small MF/BTR Independent"),
                           "type/scale confound absent — revisit whether this fix is still warranted")


def _build_from(seed_dict):
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(seed_dict, f)
        path = f.name
    try:
        return build(path)
    finally:
        os.unlink(path)


if __name__ == "__main__":
    unittest.main()
