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
    """The per-field aggregate: agreement rate, threshold pass/fail, capped
    mismatch samples."""

    def test_all_fields_agree(self):
        pairs = [
            (
                "1",
                {"uru_id": "9", "bedrooms": "2", "amenities": "A; B", "photos": "1;2"},
                {"uru_id": "9", "bedrooms": "2.0", "amenities": "A;B", "photos": "2;1"},
            )
        ]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["uru_id"]["agreement"], 1.0)
        self.assertEqual(report["bedrooms"]["agreement"], 1.0)
        self.assertEqual(report["amenities"]["agreement"], 1.0)  # count-based
        self.assertEqual(report["amenities_string"]["agreement"], 0.0)  # exact
        self.assertEqual(report["photos"]["agreement"], 1.0)

    def test_mismatch_is_counted_and_sampled(self):
        pairs = [
            ("1", {"uru_id": "9"}, {"uru_id": "9"}),
            ("2", {"uru_id": "9"}, {"uru_id": "10"}),
        ]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["uru_id"]["agreement"], 0.5)
        self.assertEqual(report["uru_id"]["compared"], 2)
        self.assertEqual(len(report["uru_id"]["mismatch_samples"]), 1)
        self.assertEqual(report["uru_id"]["mismatch_samples"][0]["listing_id"], "2")

    def test_mismatch_samples_capped(self):
        pairs = [
            (str(i), {"uru_id": "9"}, {"uru_id": "x"}) for i in range(10)
        ]
        report = reconcile_source.compare_matched_fields(pairs, max_samples=5)
        self.assertEqual(len(report["uru_id"]["mismatch_samples"]), 5)
        self.assertEqual(report["uru_id"]["compared"], 10)

    def test_company_id_compares_against_export_child_company_id(self):
        # field_mapping.md: c.id (reader's `company_id`) == export's
        # `child_company_id`, VERIFIED 1000/1000 + 12,935/12,935 whole-export.
        pairs = [("1", {"child_company_id": "555"}, {"company_id": "555"})]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["company_id"]["agreement"], 1.0)

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
