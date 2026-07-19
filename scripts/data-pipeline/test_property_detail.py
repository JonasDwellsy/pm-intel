import unittest

from property_detail import build_property_detail, compute_market_comps, assemble_property_detail


def _mk_comm(**kw):
    base = {"label": "Oak Ridge", "units": 120, "dom": [20, 22, 24], "rent_t12": [1480, 1500],
            "rent_prior": [1440], "concession_hits": 0, "n_listings": 3,
            "marketing": [{"amenities_n": 5, "desc_len": 800, "distinct_words": 120,
                           "content_cats": 4, "photos_n": 12}], "submarket": "chattanooga-tn"}
    base.update(kw)
    return base


def _mk_comm_bucket(**kw):
    # Shape as pipeline.py builds it for assemble_property_detail: a
    # community bucket, PLUS "homes" (only used if it folds into SFR).
    base = {"label": "Oak Ridge", "submarket": "chattanooga-tn", "dom": [20, 22],
            "rent_t12": [1480, 1500], "rent_prior": [1440], "concession_hits": 0,
            "n_listings": 2, "marketing": [], "homes": 2}
    base.update(kw)
    return base


def _mk_sfr_bucket(**kw):
    base = {"label": "Chattanooga", "submarket": "chattanooga-tn", "dom": [30],
            "rent_t12": [1600], "rent_prior": [1550], "concession_hits": 0,
            "n_listings": 1, "marketing": [], "homes": 5}
    base.update(kw)
    return base


_COMPS = {"medianDomT12": 25, "medianRentT12": 1500, "rentYoY": 0.01, "concessionRate": 0.1}


class PropertyDetailBuilder(unittest.TestCase):
    """Pure per-property detail builder: turns per-operator community / SFR-
    submarket listing buckets into propertyDetail records. Observation-only —
    no per-property score/star/percentile-rank field.
    """

    def test_mf_community_record_has_median_dom_rent_and_no_score(self):
        out = build_property_detail(
            communities={"c1": _mk_comm()}, sfr_by_submarket={},
            comps={"medianDomT12": 29, "medianRentT12": 1520, "rentYoY": 0.01, "concessionRate": 0.17})
        self.assertIsNotNone(out)
        p = next(r for r in out["properties"] if r["kind"] == "community")
        self.assertEqual(p["label"], "Oak Ridge")
        self.assertEqual(p["units"], 120)
        self.assertEqual(p["medianDomT12"], 22)          # median([20,22,24])
        self.assertEqual(p["medianRentT12"], 1490)        # median([1480,1500])
        self.assertEqual(p["nListings"], 3)
        self.assertNotIn("score", p)
        self.assertNotIn("star", p)
        self.assertNotIn("percentileRank", p)
        self.assertEqual(out["comps"]["medianDomT12"], 29)

    def test_sfr_submarket_rollup_uses_homes_and_null_units(self):
        out = build_property_detail(
            communities={},
            sfr_by_submarket={"mesa-az": {"label": "Mesa", "homes": 40, "dom": [31, 29],
                "rent_t12": [2150, 2100], "rent_prior": [2200], "concession_hits": 1,
                "n_listings": 2, "marketing": [], "submarket": "mesa-az"}},
            comps={"medianDomT12": 33, "medianRentT12": 2000, "rentYoY": -0.02, "concessionRate": 0.1})
        p = next(r for r in out["properties"] if r["kind"] == "sfr-submarket")
        self.assertIsNone(p["units"])
        self.assertEqual(p["homes"], 40)
        self.assertEqual(p["concessionRate"], 0.5)        # 1 hit / 2 listings
        self.assertIsNotNone(p["rentYoY"])                # median(2125) vs 2200

    def test_empty_returns_none(self):
        out = build_property_detail({}, {}, {"medianDomT12": None, "medianRentT12": None,
                                              "rentYoY": None, "concessionRate": None})
        self.assertIsNone(out)


class ComputeMarketComps(unittest.TestCase):
    """MSA-median comps builder (Task 2): same rounding/guards as
    build_property_detail's per-property comps.
    """

    def test_normal_medians(self):
        out = compute_market_comps(dom_values=[20, 22, 24], rent_t12_values=[1480, 1500],
                                    rent_prior_values=[1440], concession_hits=3, n_listings=12)
        self.assertEqual(out["medianDomT12"], 22)
        self.assertEqual(out["medianRentT12"], 1490)
        self.assertIsNotNone(out["rentYoY"])
        self.assertEqual(out["concessionRate"], round(3 / 12, 3))

    def test_empty_inputs_all_none(self):
        out = compute_market_comps([], [], [], 0, 0)
        self.assertIsNone(out["medianDomT12"])
        self.assertIsNone(out["medianRentT12"])
        self.assertIsNone(out["rentYoY"])
        self.assertIsNone(out["concessionRate"])

    def test_zero_prior_rent_yoy_none(self):
        out = compute_market_comps(dom_values=[10], rent_t12_values=[1000], rent_prior_values=[0],
                                    concession_hits=1, n_listings=2)
        self.assertIsNone(out["rentYoY"])
        # other fields still compute normally despite the zero-prior guard
        self.assertEqual(out["medianDomT12"], 10)
        self.assertEqual(out["medianRentT12"], 1000)
        self.assertEqual(out["concessionRate"], 0.5)


class AssemblePropertyDetail(unittest.TestCase):
    """Concentrated-vs-scattered split (Task 2): communities at/above the
    URU threshold stay MF community records; below-threshold communities
    fold into the SFR submarket bucket keyed by their own submarket.
    """

    def test_concentrated_community_stays_a_community_record(self):
        out = assemble_property_detail(
            comm_buckets={"c1": _mk_comm_bucket()},
            comm_urus_counts={"c1": 15},
            sfr_buckets={},
            comps=_COMPS)
        self.assertIsNotNone(out)
        self.assertEqual(len(out["properties"]), 1)
        p = out["properties"][0]
        self.assertEqual(p["kind"], "community")
        self.assertEqual(p["units"], 15)
        self.assertIsNone(p["homes"])

    def test_scattered_community_folds_into_matching_sfr_submarket(self):
        out = assemble_property_detail(
            comm_buckets={"c1": _mk_comm_bucket(n_listings=2, dom=[20, 22], rent_t12=[1480, 1500],
                                                 rent_prior=[1440], concession_hits=1, homes=2,
                                                 submarket="chattanooga-tn")},
            comm_urus_counts={"c1": 4},  # below default min_concentrated=10
            sfr_buckets={"chattanooga-tn": _mk_sfr_bucket(n_listings=1, dom=[30], rent_t12=[1600],
                                                           rent_prior=[1550], concession_hits=0, homes=5)},
            comps=_COMPS)
        self.assertIsNotNone(out)
        # the scattered community merges into the existing sfr-submarket
        # record rather than appearing as its own row
        self.assertEqual(len(out["properties"]), 1)
        p = out["properties"][0]
        self.assertEqual(p["kind"], "sfr-submarket")
        self.assertEqual(p["nListings"], 3)      # 2 (community) + 1 (sfr)
        self.assertEqual(p["homes"], 7)           # 2 + 5
        self.assertEqual(p["medianDomT12"], 22)   # median([20, 22, 30])

    def test_scattered_only_operator_yields_all_sfr_records(self):
        out = assemble_property_detail(
            comm_buckets={}, comm_urus_counts={},
            sfr_buckets={"mesa-az": _mk_sfr_bucket(submarket="mesa-az", label="Mesa")},
            comps=_COMPS)
        self.assertIsNotNone(out)
        self.assertTrue(out["properties"])
        self.assertTrue(all(p["kind"] == "sfr-submarket" for p in out["properties"]))

    def test_empty_returns_none(self):
        out = assemble_property_detail({}, {}, {}, _COMPS)
        self.assertIsNone(out)


if __name__ == "__main__":
    unittest.main()
