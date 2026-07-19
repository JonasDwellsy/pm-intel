import unittest

from property_detail import build_property_detail


def _mk_comm(**kw):
    base = {"label": "Oak Ridge", "units": 120, "dom": [20, 22, 24], "rent_t12": [1480, 1500],
            "rent_prior": [1440], "concession_hits": 0, "n_listings": 3,
            "marketing": [{"amenities_n": 5, "desc_len": 800, "distinct_words": 120,
                           "content_cats": 4, "photos_n": 12}], "submarket": "chattanooga-tn"}
    base.update(kw)
    return base


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


if __name__ == "__main__":
    unittest.main()
