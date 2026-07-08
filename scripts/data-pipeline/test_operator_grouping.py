import unittest, json, tempfile, os
from operator_grouping import (
    within_market_key, load_do_not_merge, merged_override,  # merged_override new
    strong_name_key, is_distinctive, _legal_suffix_count,
    LEGAL_SUFFIXES, GENERIC_TOKENS,
)
from operator_grouping import (
    compute_auto_merges, auto_merge_map,
    assert_auto_merge_invariants, format_auto_merge_report,
)
import json as _json, tempfile as _tf, os as _os


def _row(name, parent_id="", child_id=""):
    return {"parent_id": parent_id, "child_id": child_id, "name": name}

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

class ParentKeyedMerge(unittest.TestCase):
    # Fold a no-parent "X LLC" fragment into a parent-keyed "X" whose real parent
    # id is 31871 (mirrors the 31 Realty / DFW case). survivorKey is the parent
    # id; both the LLC name-key and the parent id map onto it.
    MAP = {
        ("dfw", "31871"): {"survivorKey": "31871",
            "canonicalName": "31 Realty Property Management", "survivorSlug": "31-realty"},
        ("dfw", "name:31realtypropertymanagementllc"): {"survivorKey": "31871",
            "canonicalName": "31 Realty Property Management", "survivorSlug": "31-realty"},
    }
    def test_no_parent_member_folds_into_parent_keyed_survivor(self):
        self.assertEqual(
            within_market_key("", "915314", "31 Realty Property Management LLC", "dfw", set(), self.MAP),
            "31871")
    def test_parent_keyed_survivor_rows_keep_parent_id(self):
        self.assertEqual(
            within_market_key("31871", "3206", "31 Realty Property Management", "dfw", set(), self.MAP),
            "31871")
    def test_parent_id_remaps_when_in_map(self):
        # a differently-parented fragment can be remapped onto another survivor
        m = {("dfw", "800221"): {"survivorKey": "31871", "canonicalName": "X", "survivorSlug": "x"}}
        self.assertEqual(within_market_key("800221", "1", "Whatever", "dfw", set(), m), "31871")
    def test_parent_id_untouched_when_not_in_map(self):
        self.assertEqual(within_market_key("999", "1", "Whatever", "dfw", set(), self.MAP), "999")
    def test_merged_override_on_parent_id_survivor(self):
        self.assertEqual(
            merged_override("dfw", "31871", self.MAP),
            {"canonicalName": "31 Realty Property Management", "survivorSlug": "31-realty"})


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

class StrongNameKey(unittest.TestCase):
    def test_strips_legal_suffix_and_punctuation(self):
        self.assertEqual(strong_name_key("Spectrum Realty Services, LLC"), "spectrum realty services")
        self.assertEqual(strong_name_key("Spectrum Realty Services"), "spectrum realty services")
    def test_inc_corp_company(self):
        self.assertEqual(strong_name_key("Federated Property Management Group, Inc."),
                         "federated property management group")
    def test_ascii_only_drops_accents(self):
        # accented chars are non-[a-z0-9] -> become separators (ASCII parity with TS)
        self.assertEqual(strong_name_key("Peña Realty"), "pe a realty")
    def test_all_suffix_falls_back_to_raw_norm(self):
        # nothing distinctive left -> join of [] is "" -> fall back to the space-normed s
        self.assertEqual(strong_name_key("LLC"), "llc")
    def test_empty(self):
        self.assertEqual(strong_name_key(""), "")

class IsDistinctive(unittest.TestCase):
    def test_generic_only_false(self):
        self.assertFalse(is_distinctive("property management"))
        self.assertFalse(is_distinctive("real estate group"))
    def test_has_non_generic_true(self):
        self.assertTrue(is_distinctive("31 realty property management"))
        self.assertTrue(is_distinctive("spectrum realty services"))
    def test_single_token_false(self):
        self.assertFalse(is_distinctive("redfin"))
    def test_empty_false(self):
        self.assertFalse(is_distinctive(""))

class LegalSuffixCount(unittest.TestCase):
    def test_counts_suffix_tokens(self):
        self.assertEqual(_legal_suffix_count("31 Realty Property Management LLC"), 1)
        self.assertEqual(_legal_suffix_count("Acme Co., Inc."), 2)
        self.assertEqual(_legal_suffix_count("31 Realty Property Management"), 0)

class ComputeAutoMerges(unittest.TestCase):
    def test_name_vs_name_suffix_only(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        cl = compute_auto_merges(rows, "atlanta-ga", set())
        self.assertEqual(len(cl), 1)
        c = cl[0]
        self.assertEqual(c["strong"], "spectrum realty services")
        self.assertEqual(c["canonicalName"], "Spectrum Realty Services")   # fewer suffix tokens
        self.assertEqual(c["survivorKey"], "name:spectrumrealtyservices")   # no parent -> canonical name-key
        self.assertEqual(sorted(m["key"] for m in c["members"]),
                         ["name:spectrumrealtyservices", "name:spectrumrealtyservicesllc"])

    def test_name_vs_parent_31_realty_shape(self):
        rows = [_row("31 Realty Property Management", parent_id="31871", child_id="3206"),
                _row("31 Realty Property Management LLC", child_id="915314")]
        cl = compute_auto_merges(rows, "dallas-fort-worth-arlington-tx", set())
        self.assertEqual(len(cl), 1)
        c = cl[0]
        self.assertEqual(c["survivorKey"], "31871")                          # parent id wins
        self.assertEqual(c["canonicalName"], "31 Realty Property Management") # suffix-free
        self.assertEqual(sorted(m["key"] for m in c["members"]),
                         ["31871", "name:31realtypropertymanagementllc"])

    def test_parent_vs_parent_lowest_id(self):
        rows = [_row("Acme Property Management", parent_id="900", child_id="1"),
                _row("Acme Property Management", parent_id="100", child_id="2")]
        cl = compute_auto_merges(rows, "x", set())
        self.assertEqual(cl[0]["survivorKey"], "100")

    def test_placeholder_never_merges(self):
        rows = [_row("Company Name Not Provided", child_id="915314"),
                _row("Company Name Not Provided", child_id="545338")]
        self.assertEqual(compute_auto_merges(rows, "chicago", set()), [])

    def test_name_key_denylisted_never_merges(self):
        dnm = {("birmingham-al", "omegarealtygroup")}   # name_key form (within_market_key)
        rows = [_row("Omega Realty Group", child_id="1"),
                _row("Omega Realty Group, LLC", child_id="2")]
        # both no-parent rows -> denylisted one returns child-id (non-candidate);
        # the LLC one is name-keyed but now alone in its strong group -> no merge.
        self.assertEqual(compute_auto_merges(rows, "birmingham-al", dnm), [])

    def test_generic_only_not_merged(self):
        rows = [_row("Property Management", child_id="1"),
                _row("Property Management LLC", child_id="2")]
        self.assertEqual(compute_auto_merges(rows, "x", set()), [])

    def test_single_token_not_merged(self):
        rows = [_row("Redfin", child_id="1"), _row("Redfin LLC", child_id="2")]
        self.assertEqual(compute_auto_merges(rows, "x", set()), [])

    def test_strong_norm_veto(self):
        dnm = {("atlanta-ga", "spectrum realty services")}  # strong-norm form (auto-merge veto)
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        self.assertEqual(compute_auto_merges(rows, "atlanta-ga", dnm), [])

    def test_single_base_key_no_merge(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services", child_id="2")]  # same name_key -> one base_key
        self.assertEqual(compute_auto_merges(rows, "x", set()), [])

    def test_canonical_prefers_fewest_suffix_tokens(self):
        # a no-parent "X" and a parented "X LLC": survivor = parent id (durable),
        # but canonical display = the suffix-free no-parent name.
        rows = [_row("Zeta Realty Partners", child_id="1"),
                _row("Zeta Realty Partners LLC", parent_id="5", child_id="2")]
        c = compute_auto_merges(rows, "x", set())[0]
        self.assertEqual(c["canonicalName"], "Zeta Realty Partners")   # 0 suffix tokens
        self.assertEqual(c["survivorKey"], "5")                        # parent id, decoupled from display

    def test_childless_denylisted_row_never_merges(self):
        # old-schema (no ids) + name_key denylist: within_market_key returns a
        # mergeable name-key, so the explicit denylist check must exclude it.
        dnm = {("x", "omegarealtygroup")}
        rows = [_row("Omega Realty Group"),                    # both ids empty
                _row("Omega Realty Group, LLC", child_id="2")]
        self.assertEqual(compute_auto_merges(rows, "x", dnm), [])

class AutoMergeMap(unittest.TestCase):
    def test_map_shape_survivor_maps_to_itself(self):
        rows = [_row("31 Realty Property Management", parent_id="31871", child_id="3206"),
                _row("31 Realty Property Management LLC", child_id="915314")]
        cl = compute_auto_merges(rows, "dfw", set())
        m = auto_merge_map(cl, "dfw")
        self.assertEqual(m[("dfw", "31871")]["survivorKey"], "31871")
        self.assertEqual(m[("dfw", "name:31realtypropertymanagementllc")]["survivorKey"], "31871")
        self.assertEqual(m[("dfw", "31871")]["canonicalName"], "31 Realty Property Management")

class AutoMergeInvariants(unittest.TestCase):
    def test_clean_clusters_pass(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        cl = compute_auto_merges(rows, "atlanta-ga", set())
        assert_auto_merge_invariants(cl, "atlanta-ga", set())  # no raise

    def test_report_nonempty_and_has_veto_string(self):
        rows = [_row("Spectrum Realty Services", child_id="1"),
                _row("Spectrum Realty Services, LLC", child_id="2")]
        cl = compute_auto_merges(rows, "atlanta-ga", set())
        rpt = format_auto_merge_report(cl, "atlanta-ga")
        self.assertIn("spectrum realty services", rpt)
        self.assertIn("do_not_merge.json", rpt)


class AutoMergeInvariantsNegative(unittest.TestCase):
    def test_non_distinctive_cluster_raises(self):
        bad = [{"strong": "property management", "survivorKey": "name:a",
                "canonicalName": "A", "survivorSlug": "a-x",
                "members": [{"key": "name:a", "name": "A", "had_parent": False},
                            {"key": "name:b", "name": "B", "had_parent": False}]}]
        with self.assertRaises(AssertionError):
            assert_auto_merge_invariants(bad, "x", set())

    def test_survivor_not_member_raises(self):
        bad = [{"strong": "acme realty", "survivorKey": "name:ghost",
                "canonicalName": "Acme Realty", "survivorSlug": "acme-realty-x",
                "members": [{"key": "name:a", "name": "Acme Realty", "had_parent": False},
                            {"key": "name:b", "name": "Acme Realty LLC", "had_parent": False}]}]
        with self.assertRaises(AssertionError):
            assert_auto_merge_invariants(bad, "x", set())


if __name__ == "__main__":
    unittest.main()
