import unittest
from property_detail import build_home_records


def _acc(**kw):
    base = {"address": "", "submarket": None, "lat": None, "lng": None,
            "brs": [], "rents": [], "doms": [], "dates": [], "concession": False, "n": 0}
    base.update(kw)
    return base


class BuildHomeRecords(unittest.TestCase):
    def test_aggregates_one_home_across_events(self):
        recs = {"a1": _acc(address="12 Oak St", submarket="chattanooga", lat=35.0, lng=-85.3,
                           brs=[3, 3], rents=[1400, 1500], doms=[20, 30],
                           dates=["2026-01-01", "2026-06-01"], concession=True, n=2)}
        out = build_home_records(recs)
        self.assertEqual(len(out), 1)
        r = out[0]
        self.assertEqual(r["addressId"], "a1")
        self.assertEqual(r["address"], "12 Oak St")
        self.assertEqual(r["submarket"], "chattanooga")
        self.assertEqual(r["bedrooms"], 3)                       # modal
        self.assertEqual(r["medianRentT12"], 1450)               # median rounded
        self.assertEqual(r["domT12"], 25)                        # median rounded
        self.assertEqual(r["lastListedDate"], "2026-06-01")      # max
        self.assertEqual(r["nListings"], 2)
        self.assertTrue(r["concession"])

    def test_nulls_when_no_numeric_data(self):
        out = build_home_records({"a2": _acc(address="9 Elm", n=1)})
        r = out[0]
        self.assertIsNone(r["medianRentT12"])
        self.assertIsNone(r["domT12"])
        self.assertIsNone(r["bedrooms"])
        self.assertIsNone(r["lastListedDate"])

    def test_sorted_by_address(self):
        out = build_home_records({"a": _acc(address="Zebra Ln", n=1),
                                  "b": _acc(address="Alpha Rd", n=1)})
        self.assertEqual([r["address"] for r in out], ["Alpha Rd", "Zebra Ln"])


if __name__ == "__main__":
    unittest.main()
