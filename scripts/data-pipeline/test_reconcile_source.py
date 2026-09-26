"""Tests for the superset reconciliation gate (Task 5).

No network: everything here exercises the pure key/classification/comparison
logic with fabricated inputs. The two live-database runs (Bozeman 14580,
Kansas City 28140) are driven separately via the CLI, not by this suite --
see task-5-report.md for their output.
"""
import unittest

import reconcile_source


class ListingKey(unittest.TestCase):
    """Task 2 proved the export's listing_id equals property_listing_table.id
    1:1, and the reader emits it -- so the key is listing_id, not the
    brief's original (uru_id, creation date)."""

    def test_key_is_listing_id(self):
        row = {"listing_id": "123", "uru_id": "9", "x": "y"}
        self.assertEqual(reconcile_source.listing_key(row), "123")

    def test_blank_listing_id_is_not_a_key(self):
        self.assertIsNone(reconcile_source.listing_key({"listing_id": ""}))
        self.assertIsNone(reconcile_source.listing_key({}))
        self.assertIsNone(reconcile_source.listing_key({"listing_id": None}))
        self.assertIsNone(reconcile_source.listing_key({"listing_id": "   "}))

    def test_two_blank_ids_never_collapse_into_one_key(self):
        # A naive `key or "MISSING"` scheme would make two unrelated blank
        # rows look like a match. build_key_set must drop blanks entirely,
        # not fold them into a shared sentinel.
        rows = [{"listing_id": ""}, {"listing_id": ""}]
        keys = reconcile_source.build_key_set(rows)
        self.assertEqual(keys, set())

    def test_build_key_set_keeps_real_ids(self):
        rows = [{"listing_id": "1"}, {"listing_id": ""}, {"listing_id": "2"}]
        self.assertEqual(reconcile_source.build_key_set(rows), {"1", "2"})


class ClassifyExportOnlyRow(unittest.TestCase):
    """export-only rows: not_in_db (real failure), excluded:<preds> (the
    population filter explains it, does not fail the gate), or
    in_population_but_missed (a reader bug, fails the gate)."""

    def test_not_in_db_when_no_diagnostic_row(self):
        self.assertEqual(
            reconcile_source.classify_export_only_row("1", None), "not_in_db"
        )

    def test_excluded_by_a_single_predicate(self):
        result = reconcile_source.classify_export_only_row(
            "2", {"market": True, "has_uru": False, "rent_band": True}
        )
        self.assertEqual(result, "excluded:has_uru")

    def test_excluded_by_multiple_predicates_preserves_order(self):
        result = reconcile_source.classify_export_only_row(
            "3",
            {
                "market": True,
                "lifecycle": True,
                "has_uru": False,
                "rent_band": False,
            },
        )
        self.assertEqual(result, "excluded:has_uru+rent_band")

    def test_in_population_but_missed_when_every_predicate_true(self):
        result = reconcile_source.classify_export_only_row(
            "4", {"market": True, "has_uru": True, "rent_band": True}
        )
        self.assertEqual(result, "in_population_but_missed")


class ClassifyDbOnlyRow(unittest.TestCase):
    """db-only rows (data we weren't receiving) bucket into
    before_export_history / after_export_asof / other (the unexplained
    gap -- field_mapping.md open question 3)."""

    def setUp(self):
        self.export_min = "2020-10-29 00:00:00"
        self.export_max = "2026-09-08 23:59:59"

    def test_before_export_history(self):
        result = reconcile_source.classify_db_only_row(
            "2019-01-01 00:00:00", self.export_min, self.export_max
        )
        self.assertEqual(result, "before_export_history")

    def test_after_export_asof(self):
        result = reconcile_source.classify_db_only_row(
            "2026-09-20 00:00:00", self.export_min, self.export_max
        )
        self.assertEqual(result, "after_export_asof")

    def test_within_window_is_other(self):
        result = reconcile_source.classify_db_only_row(
            "2023-05-01 00:00:00", self.export_min, self.export_max
        )
        self.assertEqual(result, "other")

    def test_blank_creation_time_is_other(self):
        result = reconcile_source.classify_db_only_row(
            "", self.export_min, self.export_max
        )
        self.assertEqual(result, "other")


class BlankAndNumericNormalisation(unittest.TestCase):
    """The pipeline treats '' and 'null' as missing (field_mapping.md,
    'Notes for Task 3 on output shape') -- the comparison logic must too."""

    def test_norm_blank_treats_empty_and_null_as_blank(self):
        self.assertEqual(reconcile_source._norm_blank(""), "")
        self.assertEqual(reconcile_source._norm_blank(None), "")
        self.assertEqual(reconcile_source._norm_blank("null"), "")
        self.assertEqual(reconcile_source._norm_blank("NULL"), "")
        self.assertEqual(reconcile_source._norm_blank("  x  "), "x")

    def test_to_number_parses_equivalent_numeric_strings(self):
        self.assertEqual(reconcile_source._to_number("1450"), 1450.0)
        self.assertEqual(reconcile_source._to_number("1450.00"), 1450.0)
        self.assertEqual(reconcile_source._to_number("1450"), reconcile_source._to_number("1450.00"))

    def test_to_number_blank_and_null_are_none(self):
        self.assertIsNone(reconcile_source._to_number(""))
        self.assertIsNone(reconcile_source._to_number("null"))
        self.assertIsNone(reconcile_source._to_number(None))

    def test_to_number_unparseable_is_none(self):
        self.assertIsNone(reconcile_source._to_number("abc"))


class CountParts(unittest.TestCase):
    """photos/amenities are compared by the pipeline's own count contract:
    non-blank ';'-separated parts (pipeline.py amenities_n/photos_n)."""

    def test_counts_semicolon_parts(self):
        self.assertEqual(reconcile_source._count_parts("1;2;3"), 3)

    def test_drops_blank_parts(self):
        self.assertEqual(reconcile_source._count_parts("a;;b"), 2)
        self.assertEqual(reconcile_source._count_parts("a; ;b"), 2)

    def test_blank_and_null_are_zero(self):
        self.assertEqual(reconcile_source._count_parts(""), 0)
        self.assertEqual(reconcile_source._count_parts(None), 0)
        self.assertEqual(reconcile_source._count_parts("null"), 0)


class ValuesMatch(unittest.TestCase):
    def test_numeric_comparator_ignores_decimal_formatting(self):
        self.assertTrue(reconcile_source._values_match("numeric", "1450", "1450.00"))
        self.assertFalse(reconcile_source._values_match("numeric", "1450", "1451"))

    def test_count_comparator_ignores_order_and_spacing(self):
        self.assertTrue(reconcile_source._values_match("count", "1;2;3", "3;2;1"))
        self.assertTrue(reconcile_source._values_match("count", "A; B", "A;B"))
        self.assertFalse(reconcile_source._values_match("count", "1;2", "1;2;3"))

    def test_exact_comparator_normalises_blank_and_null(self):
        self.assertTrue(reconcile_source._values_match("exact", "", "null"))
        self.assertTrue(reconcile_source._values_match("exact", "null", ""))
        self.assertFalse(reconcile_source._values_match("exact", "A; B", "A;B"))
        self.assertTrue(reconcile_source._values_match("exact", "Apartment", "Apartment"))


class CompareMatchedFields(unittest.TestCase):
    """The per-field aggregate: agreement rate (all-rows and non-drifted),
    threshold pass/fail against the non-drifted rate, capped mismatch
    samples split drifted/non-drifted. No `drift` argument (the default,
    None) means every row is treated as NOT drifted -- the conservative
    default that keeps old callers' behavior unchanged."""

    def test_all_fields_agree(self):
        pairs = [
            (
                "1",
                {"uru_id": "9", "bedrooms": "2", "amenities": "A; B", "photos": "1;2"},
                {"uru_id": "9", "bedrooms": "2.0", "amenities": "A;B", "photos": "2;1"},
            )
        ]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 1.0)
        self.assertEqual(report["bedrooms"]["agreement_non_drifted"], 1.0)
        self.assertEqual(report["amenities"]["agreement_non_drifted"], 1.0)  # count-based
        self.assertEqual(report["amenities_string"]["agreement_non_drifted"], 0.0)  # exact
        self.assertEqual(report["photos"]["agreement_non_drifted"], 1.0)
        # agreement_all matches agreement_non_drifted when nothing is drifted.
        self.assertEqual(report["uru_id"]["agreement_all"], 1.0)

    def test_mismatch_is_counted_and_sampled(self):
        pairs = [
            ("1", {"uru_id": "9"}, {"uru_id": "9"}),
            ("2", {"uru_id": "9"}, {"uru_id": "10"}),
        ]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 0.5)
        self.assertEqual(report["uru_id"]["agreement_all"], 0.5)
        self.assertEqual(report["uru_id"]["compared"], 2)
        self.assertEqual(report["uru_id"]["drifted"], 0)
        self.assertEqual(report["uru_id"]["non_drifted"], 2)
        self.assertEqual(len(report["uru_id"]["mismatch_samples_non_drifted"]), 1)
        self.assertEqual(report["uru_id"]["mismatch_samples_non_drifted"][0]["listing_id"], "2")
        self.assertEqual(report["uru_id"]["mismatch_samples_drifted"], [])

    def test_mismatch_samples_capped(self):
        pairs = [
            (str(i), {"uru_id": "9"}, {"uru_id": "x"}) for i in range(10)
        ]
        report = reconcile_source.compare_matched_fields(pairs, max_samples=5)
        self.assertEqual(len(report["uru_id"]["mismatch_samples_non_drifted"]), 5)
        self.assertEqual(report["uru_id"]["compared"], 10)

    def test_company_id_compares_against_export_child_company_id(self):
        # field_mapping.md: c.id (reader's `company_id`) == export's
        # `child_company_id`, VERIFIED 1000/1000 + 12,935/12,935 whole-export.
        pairs = [("1", {"child_company_id": "555"}, {"company_id": "555"})]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["company_id"]["agreement_non_drifted"], 1.0)

    def test_threshold_failure_marks_field_not_ok(self):
        pairs = [
            ("1", {"uru_id": "9"}, {"uru_id": "9"}),
            ("2", {"uru_id": "9"}, {"uru_id": "MISMATCH"}),
        ]
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(pairs, thresholds=thresholds)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["threshold"], 0.99)

    def test_threshold_pass_marks_field_ok(self):
        pairs = [("1", {"uru_id": "9"}, {"uru_id": "9"})]
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(pairs, thresholds=thresholds)
        self.assertTrue(report["uru_id"]["ok"])

    def test_no_compared_rows_is_vacuously_ok(self):
        report = reconcile_source.compare_matched_fields([])
        self.assertEqual(report["uru_id"]["compared"], 0)
        self.assertTrue(report["uru_id"]["ok"])


class DriftSplit(unittest.TestCase):
    """Controller ruling (Fix round 1): the strict threshold applies only to
    NON-drifted rows -- a mismatch on a row whose source changed after
    as_of is not a failure signal, but a mismatch on a row that did NOT
    change is still a real one."""

    def test_mismatch_on_drifted_row_does_not_count_against_the_rate(self):
        pairs = [
            ("1", {"uru_id": "9"}, {"uru_id": "9"}),        # clean, matches
            ("2", {"uru_id": "9"}, {"uru_id": "CHANGED"}),  # mismatch, but drifted
        ]
        drift = {"uru_id": {"2": True}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 1.0)
        self.assertEqual(report["uru_id"]["agreement_all"], 0.5)
        self.assertEqual(report["uru_id"]["drifted"], 1)
        self.assertEqual(report["uru_id"]["non_drifted"], 1)
        self.assertTrue(report["uru_id"]["ok"])
        self.assertEqual(len(report["uru_id"]["mismatch_samples_drifted"]), 1)
        self.assertEqual(report["uru_id"]["mismatch_samples_drifted"][0]["listing_id"], "2")
        self.assertEqual(report["uru_id"]["mismatch_samples_non_drifted"], [])

    def test_mismatch_on_non_drifted_row_still_counts_against_the_rate(self):
        pairs = [
            ("1", {"uru_id": "9"}, {"uru_id": "9"}),
            ("2", {"uru_id": "9"}, {"uru_id": "MISMATCH"}),
        ]
        drift = {"uru_id": {"1": False, "2": False}}  # both explicitly clean
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(
            pairs, drift=drift, thresholds=thresholds
        )
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 0.5)
        self.assertEqual(report["uru_id"]["drifted"], 0)
        self.assertEqual(report["uru_id"]["non_drifted"], 2)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(len(report["uru_id"]["mismatch_samples_non_drifted"]), 1)
        self.assertEqual(report["uru_id"]["mismatch_samples_non_drifted"][0]["listing_id"], "2")

    def test_missing_drift_entry_defaults_to_not_drifted(self):
        # A listing_id absent from the field's drift dict entirely (not
        # explicitly True or False) must still count against the strict
        # rate -- unknown drift status is never a free pass.
        pairs = [("1", {"uru_id": "9"}, {"uru_id": "MISMATCH"})]
        drift = {"uru_id": {}}  # no entry at all for listing_id "1"
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["non_drifted"], 1)
        self.assertEqual(report["uru_id"]["drifted"], 0)
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 0.0)

    def test_all_drifted_is_vacuously_ok_on_the_non_drifted_rate(self):
        pairs = [("1", {"uru_id": "9"}, {"uru_id": "MISMATCH"})]
        drift = {"uru_id": {"1": True}}
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(
            pairs, drift=drift, thresholds=thresholds
        )
        self.assertEqual(report["uru_id"]["non_drifted"], 0)
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 1.0)
        self.assertTrue(report["uru_id"]["ok"])


class AsOfParsing(unittest.TestCase):
    def test_parses_trailing_yyyymmdd_from_filename(self):
        self.assertEqual(
            reconcile_source.parse_as_of(
                "/x/y/merged_bozeman-mt_20260908.csv"
            ),
            "2026-09-08",
        )

    def test_parses_kansas_city_filename_too(self):
        self.assertEqual(
            reconcile_source.parse_as_of(
                "/x/merged_kansas-city-mo-ks_20260908.csv"
            ),
            "2026-09-08",
        )

    def test_explicit_as_of_overrides_the_filename(self):
        self.assertEqual(
            reconcile_source.parse_as_of(
                "/x/merged_bozeman-mt_20260908.csv", "2026-01-01"
            ),
            "2026-01-01",
        )

    def test_raises_when_neither_filename_nor_explicit_available(self):
        with self.assertRaises(ValueError):
            reconcile_source.parse_as_of("/x/no_date_suffix_here.csv")

    def test_rejects_a_malformed_explicit_as_of(self):
        with self.assertRaises(ValueError):
            reconcile_source.parse_as_of(
                "/x/merged_bozeman-mt_20260908.csv", "not-a-date"
            )


class FieldDriftGroupCoverage(unittest.TestCase):
    """Structural consistency: every compared field has a drift group, and
    every drift group used has its source tables documented -- the "one
    constant" the controller's ruling asked for."""

    def test_every_compared_field_has_a_drift_group(self):
        for field in reconcile_source.FIELD_SPECS:
            self.assertIn(field, reconcile_source.FIELD_DRIFT_GROUP)

    def test_every_drift_group_has_documented_source_tables(self):
        groups_in_use = set(reconcile_source.FIELD_DRIFT_GROUP.values())
        self.assertEqual(groups_in_use, set(reconcile_source.DRIFT_GROUP_SOURCE_TABLES))
        for tables in reconcile_source.DRIFT_GROUP_SOURCE_TABLES.values():
            self.assertTrue(tables)
            for t in tables:
                self.assertTrue(t.startswith("dwellsy_prod."))


class ToleranceMatch(unittest.TestCase):
    """Fix round 2: latitude/longitude/top_down_community_count switch from
    exact equality to a comparator that fits how each is actually used."""

    def test_latlon_within_tolerance_passes(self):
        # 0.0009 degrees apart -- inside LATLON_TOLERANCE_DEG (0.001).
        exact, within = reconcile_source.tolerance_match(
            "latitude", "39.000000", "39.000900"
        )
        self.assertFalse(exact)
        self.assertTrue(within)

    def test_latlon_beyond_tolerance_fails(self):
        # 0.0011 degrees apart -- outside LATLON_TOLERANCE_DEG (0.001).
        exact, within = reconcile_source.tolerance_match(
            "latitude", "39.000000", "39.001100"
        )
        self.assertFalse(exact)
        self.assertFalse(within)

    def test_longitude_uses_the_same_tolerance(self):
        exact, within = reconcile_source.tolerance_match(
            "longitude", "-94.000000", "-94.000900"
        )
        self.assertTrue(within)
        _, within2 = reconcile_source.tolerance_match(
            "longitude", "-94.000000", "-94.001100"
        )
        self.assertFalse(within2)

    def test_community_count_100_vs_109_passes(self):
        # tolerance = max(2, 0.10*100) = 10; |109-100| = 9 <= 10.
        _, within = reconcile_source.tolerance_match(
            "top_down_community_count", "100", "109"
        )
        self.assertTrue(within)

    def test_community_count_100_vs_111_fails(self):
        # |111-100| = 11 > 10.
        _, within = reconcile_source.tolerance_match(
            "top_down_community_count", "100", "111"
        )
        self.assertFalse(within)

    def test_community_count_1_vs_3_passes(self):
        # tolerance = max(2, 0.10*1) = 2; |3-1| = 2 <= 2.
        _, within = reconcile_source.tolerance_match(
            "top_down_community_count", "1", "3"
        )
        self.assertTrue(within)

    def test_community_count_1_vs_4_fails(self):
        # |4-1| = 3 > 2.
        _, within = reconcile_source.tolerance_match(
            "top_down_community_count", "1", "4"
        )
        self.assertFalse(within)

    def test_exact_equal_values_are_exact_and_within_tolerance(self):
        exact, within = reconcile_source.tolerance_match(
            "top_down_community_count", "50", "50"
        )
        self.assertTrue(exact)
        self.assertTrue(within)

    def test_blank_on_one_side_is_a_mismatch_on_both_measures(self):
        exact, within = reconcile_source.tolerance_match("latitude", "", "39.0")
        self.assertFalse(exact)
        self.assertFalse(within)
        exact2, within2 = reconcile_source.tolerance_match(
            "top_down_community_count", "5", ""
        )
        self.assertFalse(exact2)
        self.assertFalse(within2)
        exact3, within3 = reconcile_source.tolerance_match(
            "top_down_community_count", "null", "5"
        )
        self.assertFalse(exact3)
        self.assertFalse(within3)

    def test_blank_on_both_sides_matches_on_both_measures(self):
        exact, within = reconcile_source.tolerance_match("latitude", "", "")
        self.assertTrue(exact)
        self.assertTrue(within)
        exact2, within2 = reconcile_source.tolerance_match(
            "top_down_community_count", "", "null"
        )
        self.assertTrue(exact2)
        self.assertTrue(within2)


class CommunityCountDiffBucket(unittest.TestCase):
    def test_buckets(self):
        cases = {
            1: "1",
            2: "2",
            3: "3-5",
            5: "3-5",
            6: "6-10",
            10: "6-10",
            11: "11-25",
            25: "11-25",
            26: ">25",
            100: ">25",
            -1: "negative",
            -50: "negative",
        }
        for diff, expected in cases.items():
            self.assertEqual(
                reconcile_source.community_count_diff_bucket(diff), expected, diff
            )


class CompareMatchedFieldsTolerance(unittest.TestCase):
    """Integration of the tolerance comparator into compare_matched_fields:
    both rates are reported, `ok` is judged on the tolerance rate, and
    top_down_community_count also carries a diff_histogram."""

    def test_tolerance_pass_but_not_exact_is_ok_and_reports_both_rates(self):
        pairs = [
            ("1", {"latitude": "39.000000"}, {"latitude": "39.000900"}),  # within tolerance, not exact
        ]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertTrue(report["latitude"]["ok"])
        self.assertEqual(report["latitude"]["agreement_non_drifted"], 1.0)
        self.assertEqual(report["latitude"]["exact_agreement_non_drifted"], 0.0)

    def test_beyond_tolerance_on_non_drifted_row_fails(self):
        pairs = [
            ("1", {"latitude": "39.000000"}, {"latitude": "39.001100"}),  # beyond tolerance
        ]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertFalse(report["latitude"]["ok"])
        self.assertEqual(report["latitude"]["agreement_non_drifted"], 0.0)
        self.assertEqual(len(report["latitude"]["mismatch_samples_non_drifted"]), 1)

    def test_beyond_tolerance_on_drifted_row_does_not_fail(self):
        pairs = [
            ("1", {"latitude": "39.000000"}, {"latitude": "39.001100"}),
        ]
        drift = {"latitude": {"1": True}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertTrue(report["latitude"]["ok"])
        self.assertEqual(report["latitude"]["non_drifted"], 0)

    def test_community_count_histogram_over_non_drifted_exact_mismatches(self):
        pairs = [
            ("1", {"top_down_community_count": "100"}, {"top_down_community_count": "101"}),  # +1
            ("2", {"top_down_community_count": "100"}, {"top_down_community_count": "102"}),  # +2
            ("3", {"top_down_community_count": "10"}, {"top_down_community_count": "13"}),    # +3
            ("4", {"top_down_community_count": "50"}, {"top_down_community_count": "49"}),    # -1 (negative)
            ("5", {"top_down_community_count": "50"}, {"top_down_community_count": "50"}),    # exact, no entry
        ]
        report = reconcile_source.compare_matched_fields(pairs)
        hist = report["top_down_community_count"]["diff_histogram"]
        self.assertEqual(hist.get("1"), 1)
        self.assertEqual(hist.get("2"), 1)
        self.assertEqual(hist.get("3-5"), 1)
        self.assertEqual(hist.get("negative"), 1)
        self.assertNotIn(">25", hist)

    def test_community_count_histogram_excludes_drifted_mismatches(self):
        pairs = [
            ("1", {"top_down_community_count": "100"}, {"top_down_community_count": "150"}),
        ]
        drift = {"top_down_community_count": {"1": True}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["top_down_community_count"]["diff_histogram"], {})

    def test_other_fields_do_not_carry_tolerance_or_histogram_keys(self):
        pairs = [("1", {"uru_id": "9"}, {"uru_id": "9"})]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertNotIn("exact_agreement_all", report["uru_id"])
        self.assertNotIn("diff_histogram", report["uru_id"])


class ExportOnlySummary(unittest.TestCase):
    """The gate-level roll-up: not_in_db / in_population_but_missed fail
    the gate; excluded:* is reported but does not."""

    def test_summarise_classification_counts(self):
        classifications = [
            "not_in_db",
            "excluded:has_uru",
            "excluded:has_uru",
            "excluded:rent_band+has_uru",
            "in_population_but_missed",
        ]
        summary = reconcile_source.summarise_export_only_classifications(classifications)
        self.assertEqual(summary["classification_counts"]["not_in_db"], 1)
        self.assertEqual(summary["classification_counts"]["excluded:has_uru"], 2)
        self.assertEqual(summary["classification_counts"]["in_population_but_missed"], 1)
        self.assertEqual(summary["not_in_db_count"], 1)
        self.assertEqual(summary["in_population_but_missed_count"], 1)
        self.assertEqual(summary["explained_count"], 3)
        # predicate_fail_counts counts each failing predicate once per row,
        # even when a row fails more than one.
        self.assertEqual(summary["predicate_fail_counts"]["has_uru"], 3)
        self.assertEqual(summary["predicate_fail_counts"]["rent_band"], 1)

    def test_gate_fails_on_not_in_db(self):
        summary = reconcile_source.summarise_export_only_classifications(["not_in_db"])
        self.assertFalse(reconcile_source.export_only_ok(summary))

    def test_gate_fails_on_in_population_but_missed(self):
        summary = reconcile_source.summarise_export_only_classifications(
            ["in_population_but_missed"]
        )
        self.assertFalse(reconcile_source.export_only_ok(summary))

    def test_gate_passes_when_fully_explained(self):
        summary = reconcile_source.summarise_export_only_classifications(
            ["excluded:has_uru", "excluded:rent_band"]
        )
        self.assertTrue(reconcile_source.export_only_ok(summary))

    def test_gate_passes_vacuously_with_no_export_only_rows(self):
        summary = reconcile_source.summarise_export_only_classifications([])
        self.assertTrue(reconcile_source.export_only_ok(summary))


class DiagnosticSql(unittest.TestCase):
    """Pure string-building test -- no network. The diagnostic query must
    run the SAME predicate expressions as WHERE_SQL, one boolean column per
    predicate, over the market_listings population's own dwellsy_source
    predicates."""

    def test_diagnostic_sql_has_one_column_per_predicate(self):
        import dwellsy_source

        sql = reconcile_source._diagnostic_sql()
        for name, _ in dwellsy_source.POPULATION_PREDICATES:
            self.assertIn(f"as {name}", sql)
        self.assertIn("l.id = any(%(ids)s::bigint[])", sql)
        self.assertIn("coalesce", sql)


class Reconcile(unittest.TestCase):
    """The top-level ok/not-ok composition, exercised without a database by
    monkeypatching the loader functions."""

    def test_ok_false_when_export_only_has_not_in_db(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=2,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications(
                ["not_in_db"]
            ),
            db_only_detail={"buckets": {}, "other_distinct_address1_ids": 0,
                             "other_distinct_companies": 0,
                             "other_company_in_export_share": None},
            db_only_count=0,
            export_only_count=1,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        self.assertFalse(result["ok"])

    def test_ok_true_when_export_only_fully_explained_and_fields_pass(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications(
                ["excluded:has_uru"]
            ),
            db_only_detail={"buckets": {}, "other_distinct_address1_ids": 0,
                             "other_distinct_companies": 0,
                             "other_company_in_export_share": None},
            db_only_count=0,
            export_only_count=1,
            field_report=reconcile_source.compare_matched_fields(
                [("1", {"uru_id": "9"}, {"uru_id": "9"})]
            ),
        )
        self.assertTrue(result["ok"])

    def test_ok_false_when_a_field_is_below_threshold(self):
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        field_report = reconcile_source.compare_matched_fields(
            [("1", {"uru_id": "9"}, {"uru_id": "MISMATCH"})], thresholds=thresholds
        )
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail={"buckets": {}, "other_distinct_address1_ids": 0,
                             "other_distinct_companies": 0,
                             "other_company_in_export_share": None},
            db_only_count=0,
            export_only_count=0,
            field_report=field_report,
        )
        self.assertFalse(result["ok"])
        self.assertIn("uru_id", result["fields_below_threshold"])


if __name__ == "__main__":
    unittest.main()
