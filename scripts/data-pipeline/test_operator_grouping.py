import unittest, json, tempfile, os
from operator_grouping import (
    within_market_key, load_do_not_merge, merged_override,  # merged_override new
)
import json as _json, tempfile as _tf, os as _os

class WithinMarketKey(unittest.TestCase):
    def test_parent_id_wins_unchanged(self):
        # parent present -> group by parent id (parent rules), regardless of name/child
        self.assertEqual(within_market_key("999", "111", "Omega Realty", "birmingham-al", set()), "999")

    def test_no_parent_groups_same_name_fragments(self):
        # two child-ids, same name, no parent -> SAME name-based key
        k1 = within_market_key("", "545103", "Omega Realty Group", "birmingham-al", set())
        k2 = within_market_key("", "915057", "Omega Realty Group", "birmingham-al", set())
        self.assertEqual(k1, k2)
        self.assertEqual(k1, "name:omegarealtygroup")

    def test_name_key_normalizes_casing_and_punctuation(self):
        self.assertEqual(
            within_market_key("", "1", "R.P. Management, Inc.", "minneapolis", set()),
            within_market_key("", "2", "RP Management Inc", "minneapolis", set()),
        )

    def test_denylisted_name_stays_fragmented_by_child_id(self):
        dnm = {("birmingham-al", "omegarealtygroup")}
        k1 = within_market_key("", "545103", "Omega Realty Group", "birmingham-al", dnm)
        k2 = within_market_key("", "915057", "Omega Realty Group", "birmingham-al", dnm)
        self.assertNotEqual(k1, k2)          # kept separate
        self.assertEqual(k1, "545103")

    def test_denylist_is_market_scoped(self):
        dnm = {("birmingham-al", "omegarealtygroup")}
        # same name, DIFFERENT market -> not denylisted -> still merges
        self.assertEqual(
            within_market_key("", "111", "Omega Realty Group", "houston-tx", dnm),
            "name:omegarealtygroup",
        )

    def test_no_ids_old_schema_falls_back_to_name(self):
        self.assertEqual(within_market_key("", "", "Some Realty", "x", set()), "name:somerealty")

    def test_placeholder_name_never_merges(self):
        # "Company Name Not Provided" is a null placeholder, not an operator —
        # two child-ids with it must stay separate (child-id keyed), not pool.
        k1 = within_market_key("", "915314", "Company Name Not Provided", "chicago", set())
        k2 = within_market_key("", "545338", "Company Name Not Provided", "chicago", set())
        self.assertEqual(k1, "915314")
        self.assertNotEqual(k1, k2)
        self.assertFalse(k1.startswith("name:"))

    def test_placeholder_variants_and_casing(self):
        for nm in ("company name not provided", "Not Provided", "Unknown", "No Company Name"):
            k = within_market_key("", "42", nm, "x", set())
            self.assertEqual(k, "42", f"{nm!r} should not merge")

class LoadDoNotMerge(unittest.TestCase):
    def test_empty_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump([], f); p = f.name
        self.assertEqual(load_do_not_merge(p), set()); os.unlink(p)

    def test_loads_pairs(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump([{"marketId": "birmingham-al", "normalizedName": "omegarealtygroup", "note": "x"}], f); p = f.name
        self.assertEqual(load_do_not_merge(p), {("birmingham-al", "omegarealtygroup")}); os.unlink(p)

    def test_missing_file_is_empty(self):
        self.assertEqual(load_do_not_merge("/no/such/file.json"), set())

class MergeMap(unittest.TestCase):
    MAP = {
        ("phoenix-az", "name:krsholdings"): {"survivorKey": "name:krsholdings",
            "canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings"},
        ("phoenix-az", "name:jamiebrightkrsholdings"): {"survivorKey": "name:krsholdings",
            "canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings"},
    }
    def test_member_remaps_to_survivor(self):
        self.assertEqual(
            within_market_key("", "1", "Jamie Bright, KRS Holdings", "phoenix-az", set(), self.MAP),
            "name:krsholdings")
    def test_survivor_maps_to_itself(self):
        self.assertEqual(
            within_market_key("", "2", "KRS Holdings", "phoenix-az", set(), self.MAP),
            "name:krsholdings")
    def test_market_scoped(self):
        self.assertEqual(
            within_market_key("", "3", "Jamie Bright, KRS Holdings", "denver-co", set(), self.MAP),
            "name:jamiebrightkrsholdings")   # different market -> normal key
    def test_unknown_key_untouched(self):
        self.assertEqual(
            within_market_key("", "4", "Some Other Realty", "phoenix-az", set(), self.MAP),
            "name:someotherrealty")
    def test_no_merge_map_is_noop(self):
        self.assertEqual(
            within_market_key("", "5", "KRS Holdings", "phoenix-az", set(), None),
            "name:krsholdings")
    def test_do_not_merge_wins_over_merge_map(self):
        dnm = {("phoenix-az", "krsholdings")}
        self.assertEqual(
            within_market_key("", "9", "KRS Holdings", "phoenix-az", dnm, self.MAP), "9")
    def test_merged_override_returns_survivor_identity(self):
        ov = merged_override("phoenix-az", "name:krsholdings", self.MAP)
        self.assertEqual(ov, {"canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings"})
    def test_merged_override_none_for_non_survivor(self):
        self.assertIsNone(merged_override("phoenix-az", "name:someotherrealty", self.MAP))
        self.assertIsNone(merged_override("phoenix-az", "name:krsholdings", None))

class LoadMergeDecisions(unittest.TestCase):
    def test_loads_and_expands_members(self):
        from operator_grouping import load_merge_decisions
        blob = {"decisions": [{"marketId": "phoenix-az", "survivorKey": "name:krsholdings",
            "canonicalName": "KRS Holdings", "survivorSlug": "krs-holdings",
            "memberKeys": ["name:krsholdings", "name:jamiebrightkrsholdings"]}]}
        with _tf.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            _json.dump(blob, f); p = f.name
        m = load_merge_decisions(p); _os.unlink(p)
        self.assertEqual(m[("phoenix-az", "name:jamiebrightkrsholdings")]["survivorKey"], "name:krsholdings")
        self.assertEqual(len(m), 2)
    def test_missing_file_empty(self):
        from operator_grouping import load_merge_decisions
        self.assertEqual(load_merge_decisions("/no/such.json"), {})

if __name__ == "__main__":
    unittest.main()
