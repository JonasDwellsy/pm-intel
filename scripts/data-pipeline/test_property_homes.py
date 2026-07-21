import unittest
from property_detail import build_home_records


def _acc(**kw):
    base = {"address": "", "cid": None, "submarket": None, "lat": None, "lng": None,
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

    def test_excludes_homes_in_concentrated_communities(self):
        # In the source, every listing carries a community_id — scattered
        # houses are micro-communities of 1, real MF holdings are communities
        # with many T12 units. The Homes export is scattered-SFR only, so a
        # home whose cid is a concentrated (>= threshold URU) community is
        # dropped; a home in a sub-threshold community is kept.
        recs = {
            "h1": _acc(address="235 Dogwood Cir", cid="scattered", n=1),
            "u1": _acc(address="2551 McCallie Ave #1", cid="bigmf", n=1),
            "u2": _acc(address="2551 McCallie Ave #2", cid="bigmf", n=1),
        }
        out = build_home_records(recs, concentrated_cids={"bigmf"})
        self.assertEqual([r["addressId"] for r in out], ["h1"])

    def test_no_cid_home_is_kept(self):
        # A listing that genuinely has no community_id (rare true-SFR bucket)
        # is never concentrated and is always kept.
        out = build_home_records({"h": _acc(address="9 Elm", cid=None, n=1)},
                                 concentrated_cids={"bigmf"})
        self.assertEqual(len(out), 1)

    def test_submarket_resolved_from_cid_map(self):
        # The home's submarket comes from the community's submarket (matching
        # the Phase 1 rollup), falling back to the accumulator's own value.
        recs = {
            "h1": _acc(address="235 Dogwood Cir", cid="c1", submarket=None, n=1),
            "h2": _acc(address="9 Elm", cid=None, submarket="hixson", n=1),
        }
        out = build_home_records(recs, submarket_by_cid={"c1": "rossville"})
        by_id = {r["addressId"]: r["submarket"] for r in out}
        self.assertEqual(by_id["h1"], "rossville")   # from cid map
        self.assertEqual(by_id["h2"], "hixson")       # fallback to accumulator


if __name__ == "__main__":
    unittest.main()
