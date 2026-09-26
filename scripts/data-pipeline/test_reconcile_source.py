"""Tests for the superset reconciliation gate (Task 5).

No network: everything here exercises the pure key/classification/comparison
logic with fabricated inputs. The two live-database runs (Bozeman 14580,
Kansas City 28140) are driven separately via the CLI, not by this suite --
see task-5-report.md for their output.
"""
import contextlib
import csv
import io
import os
import tempfile
import unittest
from unittest import mock

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

    def test_child_company_id_compares_against_export_child_company_id(self):
        # field_mapping.md: c.id (the reader's `child_company_id`, the key
        # pipeline.py actually consumes for identity) == export's
        # `child_company_id`, VERIFIED 1000/1000 + 12,935/12,935 whole-export.
        pairs = [("1", {"child_company_id": "555"}, {"child_company_id": "555"})]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["child_company_id"]["agreement_non_drifted"], 1.0)

    def test_child_company_id_blank_when_the_company_join_fails(self):
        # The reader's `company_id` (p.company_id) stays populated even when
        # the company join misses, but `child_company_id` (c.id) goes blank
        # -- this is exactly the case the gate must catch: pipeline.py reads
        # `child_company_id`, not `company_id`, for operator identity.
        pairs = [("1", {"child_company_id": "555"}, {"child_company_id": ""})]
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertEqual(report["child_company_id"]["agreement_non_drifted"], 0.0)

    def test_threshold_failure_marks_field_not_ok(self):
        # Fix round 3: enough rows to clear MIN_NON_DRIFTED_ROWS, so this
        # is a genuine below_threshold failure, not insufficient_non_drifted.
        good = [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(200)]
        bad = [(f"bad-{i}", {"uru_id": "9"}, {"uru_id": "MISMATCH"}) for i in range(10)]
        pairs = good + bad
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(pairs, thresholds=thresholds)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "below_threshold")
        self.assertEqual(report["uru_id"]["threshold"], 0.99)

    def test_threshold_pass_marks_field_ok(self):
        # Fix round 3: needs >= MIN_NON_DRIFTED_ROWS (200) non-drifted rows
        # to clear the new floor, not just a rate above the threshold.
        pairs = [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(200)]
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(pairs, thresholds=thresholds)
        self.assertTrue(report["uru_id"]["ok"])
        self.assertIsNone(report["uru_id"]["reason"])

    def test_no_compared_rows_is_insufficient_and_not_ok(self):
        # Fix round 3: zero compared rows means zero non-drifted rows, which
        # is below MIN_NON_DRIFTED_ROWS -- this can no longer pass
        # vacuously, and the rate is None (not a fabricated 1.0).
        report = reconcile_source.compare_matched_fields([])
        self.assertEqual(report["uru_id"]["compared"], 0)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "insufficient_non_drifted")
        self.assertIsNone(report["uru_id"]["agreement_all"])
        self.assertIsNone(report["uru_id"]["agreement_non_drifted"])


class DriftSplit(unittest.TestCase):
    """Controller ruling (Fix round 1): the strict threshold applies only to
    NON-drifted rows -- a mismatch on a row whose source changed after
    as_of is not a failure signal, but a mismatch on a row that did NOT
    change is still a real one."""

    def test_mismatch_on_drifted_row_does_not_count_against_the_rate(self):
        # Fix round 3: 200 clean non-drifted rows clear the new floor, so the
        # single drifted mismatch's effect on agreement_non_drifted (none)
        # vs. agreement_all (some) is isolated cleanly.
        pairs = [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(200)]
        pairs.append(("drifted-1", {"uru_id": "9"}, {"uru_id": "CHANGED"}))
        drift = {"uru_id": {"drifted-1": True}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 1.0)
        self.assertAlmostEqual(report["uru_id"]["agreement_all"], 200 / 201)
        self.assertEqual(report["uru_id"]["drifted"], 1)
        self.assertEqual(report["uru_id"]["non_drifted"], 200)
        self.assertTrue(report["uru_id"]["ok"])
        self.assertEqual(len(report["uru_id"]["mismatch_samples_drifted"]), 1)
        self.assertEqual(
            report["uru_id"]["mismatch_samples_drifted"][0]["listing_id"], "drifted-1"
        )
        self.assertEqual(report["uru_id"]["mismatch_samples_non_drifted"], [])

    def test_mismatch_on_non_drifted_row_still_counts_against_the_rate(self):
        # Fix round 3: enough non-drifted rows to clear the floor, with a
        # mismatch rate that still misses the threshold.
        good = [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(200)]
        bad = [(f"bad-{i}", {"uru_id": "9"}, {"uru_id": "MISMATCH"}) for i in range(10)]
        pairs = good + bad
        drift = {"uru_id": {lid: False for lid, _, _ in pairs}}  # all explicitly clean
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(
            pairs, drift=drift, thresholds=thresholds
        )
        self.assertEqual(report["uru_id"]["agreement_non_drifted"], 200 / 210)
        self.assertEqual(report["uru_id"]["drifted"], 0)
        self.assertEqual(report["uru_id"]["non_drifted"], 210)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "below_threshold")
        self.assertEqual(len(report["uru_id"]["mismatch_samples_non_drifted"]), 5)

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

    def test_all_drifted_fails_insufficient_non_drifted(self):
        # Fix round 3: this used to be "vacuously ok" -- non_drifted_count
        # of 0 defaulted the rate to a fabricated 1.0 and passed. Now zero
        # non-drifted rows is below the floor, the rate is None, and the
        # field fails with reason "insufficient_non_drifted", not ok.
        pairs = [("1", {"uru_id": "9"}, {"uru_id": "MISMATCH"})]
        drift = {"uru_id": {"1": True}}
        thresholds = dict(reconcile_source.FIELD_THRESHOLDS)
        thresholds["uru_id"] = 0.99
        report = reconcile_source.compare_matched_fields(
            pairs, drift=drift, thresholds=thresholds
        )
        self.assertEqual(report["uru_id"]["non_drifted"], 0)
        self.assertIsNone(report["uru_id"]["agreement_non_drifted"])
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "insufficient_non_drifted")


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


class CompanyIdentityFields(unittest.TestCase):
    """Task 6: company_name, child_company_type, parent_company_id,
    parent_company_name and parent_company_type -- exact comparison,
    threshold 0.99 (field_mapping.md measured 100%, 12,935/12,935), grouped
    under the new "company" drift group (company_table's own
    last_update_time, for the listing's company or its parent)."""

    NEW_FIELDS = (
        "company_name",
        "child_company_type",
        "parent_company_id",
        "parent_company_name",
        "parent_company_type",
    )

    def test_reassigned_property_drifts_identity_fields(self):
        # p.company_id changed A -> B: neither company row was touched, but
        # the property row was, so the identity fields must count as drifted.
        self.assertTrue(reconcile_source.company_row_drifted("B", {"B": False}, True))

    def test_company_row_change_drifts_identity_fields(self):
        self.assertTrue(reconcile_source.company_row_drifted("B", {"B": True}, False))

    def test_untouched_company_and_property_is_not_drifted(self):
        self.assertFalse(reconcile_source.company_row_drifted("B", {"B": False}, False))
        self.assertFalse(reconcile_source.company_row_drifted("", {}, False))

    def test_not_yet_emitted_is_now_empty(self):
        self.assertEqual(reconcile_source.NOT_YET_EMITTED, ())
        for field in self.NEW_FIELDS:
            self.assertNotIn(field, reconcile_source.NOT_YET_EMITTED)

    def test_new_fields_have_exact_specs_and_099_threshold(self):
        for field in self.NEW_FIELDS:
            export_col, reader_key, comparator = reconcile_source.FIELD_SPECS[field]
            self.assertEqual(export_col, field)
            self.assertEqual(reader_key, field)
            self.assertEqual(comparator, "exact")
            self.assertEqual(reconcile_source.FIELD_THRESHOLDS[field], 0.99)

    def test_new_fields_are_grouped_under_company_drift(self):
        for field in self.NEW_FIELDS:
            self.assertEqual(reconcile_source.FIELD_DRIFT_GROUP[field], "company")

    def test_company_group_has_a_documented_source_table(self):
        self.assertEqual(
            reconcile_source.DRIFT_GROUP_SOURCE_TABLES["company"],
            ("dwellsy_prod.company_table",),
        )

    def test_child_company_id_is_not_moved_to_the_company_group(self):
        # child_company_id's value is p.company_id (a property_table
        # foreign-key assignment), not a company_table attribute -- a
        # property reassignment is what would change it, and that's already
        # caught by "property_address" (p.last_update_time). A company_table
        # rename or re-type (what the "company" group watches) changes none
        # of child_company_id's own value, so it stays put -- this was a
        # genuine property_table dependency, not a placeholder used only for
        # lack of a company group.
        self.assertEqual(
            reconcile_source.FIELD_DRIFT_GROUP["child_company_id"], "property_address"
        )

    def test_mismatch_on_drifted_company_row_does_not_count_against_the_rate(self):
        pairs = [
            (str(i), {"company_name": "Acme Property Management"},
             {"company_name": "Acme Property Management"})
            for i in range(200)
        ]
        pairs.append(
            ("drifted-1", {"company_name": "Old Name LLC"}, {"company_name": "New Name LLC"})
        )
        drift = {"company_name": {"drifted-1": True}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertTrue(report["company_name"]["ok"])
        self.assertEqual(report["company_name"]["agreement_non_drifted"], 1.0)
        self.assertEqual(report["company_name"]["drifted"], 1)
        self.assertEqual(report["company_name"]["non_drifted"], 200)

    def test_mismatch_on_non_drifted_company_row_still_fails(self):
        good = [
            (str(i), {"parent_company_name": "Acme Holdings"},
             {"parent_company_name": "Acme Holdings"})
            for i in range(200)
        ]
        bad = [
            (f"bad-{i}", {"parent_company_name": "Acme Holdings"},
             {"parent_company_name": "Mismatch LLC"})
            for i in range(10)
        ]
        pairs = good + bad
        drift = {"parent_company_name": {lid: False for lid, _, _ in pairs}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertFalse(report["parent_company_name"]["ok"])
        self.assertEqual(report["parent_company_name"]["reason"], "below_threshold")
        self.assertEqual(len(report["parent_company_name"]["mismatch_samples_non_drifted"]), 5)

    def test_no_export_column_is_left_unemitted(self):
        # The gate-level roll-up should now report nothing outstanding.
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields(
                [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(200)]
            ),
        )
        self.assertEqual(result["not_yet_emitted"], [])


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
        # Fix round 3: 200 rows clears the non-drifted floor.
        pairs = [
            (str(i), {"latitude": "39.000000"}, {"latitude": "39.000900"})
            for i in range(200)
        ]  # within tolerance, not exact
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertTrue(report["latitude"]["ok"])
        self.assertEqual(report["latitude"]["agreement_non_drifted"], 1.0)
        self.assertEqual(report["latitude"]["exact_agreement_non_drifted"], 0.0)

    def test_beyond_tolerance_on_non_drifted_row_fails(self):
        # Fix round 3: enough good rows to clear the floor, plus enough
        # beyond-tolerance rows to miss the threshold -- a genuine
        # below_threshold failure, not insufficient_non_drifted.
        good = [
            (str(i), {"latitude": "39.000000"}, {"latitude": "39.000000"})
            for i in range(200)
        ]
        bad = [
            (f"bad-{i}", {"latitude": "39.000000"}, {"latitude": "39.001100"})
            for i in range(10)
        ]  # beyond tolerance
        pairs = good + bad
        report = reconcile_source.compare_matched_fields(pairs)
        self.assertFalse(report["latitude"]["ok"])
        self.assertEqual(report["latitude"]["reason"], "below_threshold")
        self.assertEqual(len(report["latitude"]["mismatch_samples_non_drifted"]), 5)

    def test_beyond_tolerance_on_drifted_row_does_not_fail(self):
        # Fix round 3: 200 clean non-drifted rows clear the floor, isolating
        # the claim that a beyond-tolerance mismatch on a DRIFTED row still
        # doesn't fail the gate.
        pairs = [
            (str(i), {"latitude": "39.000000"}, {"latitude": "39.000000"})
            for i in range(200)
        ]
        pairs.append(("drifted-1", {"latitude": "39.000000"}, {"latitude": "39.001100"}))
        drift = {"latitude": {"drifted-1": True}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertTrue(report["latitude"]["ok"])
        self.assertEqual(report["latitude"]["non_drifted"], 200)
        self.assertEqual(report["latitude"]["drifted"], 1)

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
        # export_rows=200 (not 1): explained_share_exceeded is judged against
        # well-formed export rows, and 1 explained-away row out of just 1
        # total would itself exceed the 1% cap -- 200 keeps this test about
        # what it says it's about (full explanation still passes).
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=200,
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
                # Fix round 3: 200 rows clears the non-drifted floor for
                # every field (blank-vs-blank matches trivially for fields
                # not set here).
                [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(200)]
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

    def test_ok_false_when_explained_share_exceeds_the_cap(self):
        # 11 explained-away export-only rows out of 1000 well-formed export
        # rows (1.1%) -- export_only_ok alone would pass this (every row is
        # "excluded:has_uru"), but compute_gate_failures' explained_share_
        # exceeded must still fail the gate.
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1000,
            malformed_export_rows=0,
            db_rows=989,
            matched_ids={str(i) for i in range(989)},
            export_only_summary=reconcile_source.summarise_export_only_classifications(
                ["excluded:has_uru"] * 11
            ),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=11,
            field_report=reconcile_source.compare_matched_fields(
                [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(989)]
            ),
        )
        self.assertIn("explained_share_exceeded", result["gate_failures"])
        self.assertFalse(result["ok"])


def _empty_db_only_detail() -> dict:
    return {
        "buckets": {},
        "other_distinct_address1_ids": 0,
        "other_distinct_companies": 0,
        "other_company_in_export_share": None,
    }


class ComputeGateFailures(unittest.TestCase):
    """Fix round 3, finding 1 (top-level vacuous pass): the old
    `ok = export_only_ok(...) and not fields_below_threshold` had no floor
    -- an empty export, or a wrong msa argument that makes every row
    "malformed" (see _is_malformed), gave zero matched rows, and every field
    reported compared=0 and (pre-fix) vacuously ok, so the gate exited 0
    having reconciled nothing. compute_gate_failures names each new
    condition that closes that hole."""

    def test_zero_export_rows_fails_no_export_rows(self):
        failures = reconcile_source.compute_gate_failures(
            export_rows=0, malformed_export_rows=0, matched_rows=0
        )
        self.assertIn("no_export_rows", failures)

    def test_zero_matched_rows_fails_no_matched_rows(self):
        failures = reconcile_source.compute_gate_failures(
            export_rows=100, malformed_export_rows=0, matched_rows=0
        )
        self.assertIn("no_matched_rows", failures)
        self.assertNotIn("no_export_rows", failures)

    def test_malformed_share_just_below_one_percent_passes(self):
        # 9 malformed / 1000 total = 0.9%.
        failures = reconcile_source.compute_gate_failures(
            export_rows=991, malformed_export_rows=9, matched_rows=991
        )
        self.assertNotIn("malformed_share_exceeded", failures)

    def test_malformed_share_just_above_one_percent_fails(self):
        # 11 malformed / 1000 total = 1.1%.
        failures = reconcile_source.compute_gate_failures(
            export_rows=989, malformed_export_rows=11, matched_rows=989
        )
        self.assertIn("malformed_share_exceeded", failures)

    def test_malformed_share_exactly_at_threshold_is_not_exceeded(self):
        # 10 / 1000 = exactly 1.0% -- the check is strictly '>', so the
        # boundary itself must still pass.
        failures = reconcile_source.compute_gate_failures(
            export_rows=990, malformed_export_rows=10, matched_rows=990
        )
        self.assertNotIn("malformed_share_exceeded", failures)

    def test_explained_share_just_below_one_percent_passes(self):
        # 9 explained / 1000 well-formed export rows = 0.9%.
        failures = reconcile_source.compute_gate_failures(
            export_rows=1000, malformed_export_rows=0, matched_rows=991,
            explained_export_only_rows=9,
        )
        self.assertNotIn("explained_share_exceeded", failures)

    def test_explained_share_just_above_one_percent_fails(self):
        # 11 explained / 1000 well-formed export rows = 1.1%.
        failures = reconcile_source.compute_gate_failures(
            export_rows=1000, malformed_export_rows=0, matched_rows=989,
            explained_export_only_rows=11,
        )
        self.assertIn("explained_share_exceeded", failures)

    def test_explained_share_exactly_at_threshold_is_not_exceeded(self):
        # 10 / 1000 = exactly 1.0% -- the check is strictly '>'.
        failures = reconcile_source.compute_gate_failures(
            export_rows=1000, malformed_export_rows=0, matched_rows=990,
            explained_export_only_rows=10,
        )
        self.assertNotIn("explained_share_exceeded", failures)

    def test_explained_share_defaults_to_zero_and_never_fires(self):
        # Callers that don't pass explained_export_only_rows (e.g. existing
        # callers of this function predating this gate) get 0, which never
        # exceeds the cap.
        failures = reconcile_source.compute_gate_failures(
            export_rows=100, malformed_export_rows=0, matched_rows=100
        )
        self.assertNotIn("explained_share_exceeded", failures)

    def test_all_malformed_wrong_msa_fails_both_export_and_share_gates(self):
        # A wrong msa argument makes _is_malformed reject every row: zero
        # well-formed rows, 100% malformed share.
        failures = reconcile_source.compute_gate_failures(
            export_rows=0, malformed_export_rows=250, matched_rows=0
        )
        self.assertEqual(
            set(failures),
            {"no_export_rows", "no_matched_rows", "malformed_share_exceeded"},
        )

    def test_totally_empty_input_does_not_divide_by_zero(self):
        failures = reconcile_source.compute_gate_failures(
            export_rows=0, malformed_export_rows=0, matched_rows=0
        )
        self.assertEqual(set(failures), {"no_export_rows", "no_matched_rows"})

    def test_healthy_run_has_no_gate_failures(self):
        failures = reconcile_source.compute_gate_failures(
            export_rows=1000, malformed_export_rows=1, matched_rows=999
        )
        self.assertEqual(failures, [])

    def test_gate_failure_fails_the_composed_result_even_with_perfect_fields(self):
        # Integration: a gate_failures entry must flip `ok` to False at the
        # _compose_result level even when export_only and every field are
        # otherwise clean.
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=0,
            malformed_export_rows=0,
            db_rows=0,
            matched_ids=set(),
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        self.assertFalse(result["ok"])
        self.assertIn("no_export_rows", result["gate_failures"])
        self.assertIn("no_matched_rows", result["gate_failures"])


class NonDriftedFloor(unittest.TestCase):
    """A pass that relies on setting drifted rows aside needs enough
    non-drifted evidence: at least MIN_NON_DRIFTED_ROWS (200) or
    MIN_NON_DRIFTED_SHARE (25%) of what was compared, whichever is larger.
    A field whose ALL-rows rate clears the threshold passes without it."""

    @staticmethod
    def _pairs(n_matching_non_drifted, n_mismatching_drifted):
        """Matching non-drifted rows plus mismatching drifted rows, so the
        all-rows rate fails and only the non-drifted path can pass."""
        pairs, drifted = [], {}
        for i in range(n_matching_non_drifted):
            pairs.append((f"m{i}", {"uru_id": "9"}, {"uru_id": "9"}))
        for i in range(n_mismatching_drifted):
            pairs.append((f"d{i}", {"uru_id": "9"}, {"uru_id": "MISMATCH"}))
            drifted[f"d{i}"] = True
        return pairs, {"uru_id": drifted}

    def test_199_non_drifted_rows_is_insufficient(self):
        # compared=249 -> floor = max(200, 62.25) = 200; 199 < 200.
        pairs, drift = self._pairs(199, 50)
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["non_drifted"], 199)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "insufficient_non_drifted")

    def test_200_non_drifted_rows_meets_the_floor(self):
        pairs, drift = self._pairs(200, 50)
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["non_drifted"], 200)
        self.assertTrue(report["uru_id"]["ok"])
        self.assertIsNone(report["uru_id"]["reason"])
        self.assertEqual(report["uru_id"]["passed_on"], "non_drifted")

    def test_24_percent_non_drifted_share_is_insufficient(self):
        # compared=1000 -> floor = max(200, 250) = 250; 240 < 250.
        pairs, drift = self._pairs(240, 760)
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["non_drifted"], 240)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "insufficient_non_drifted")

    def test_26_percent_non_drifted_share_meets_the_floor(self):
        pairs, drift = self._pairs(260, 740)
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["non_drifted"], 260)
        self.assertTrue(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["passed_on"], "non_drifted")

    def test_all_rows_agreement_passes_despite_a_mostly_drifted_pool(self):
        # Kansas City's identity fields: 100% agreement on every row, but a
        # noisy drift signal flags ~82% of rows. Nothing needs excusing.
        pairs = [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(1000)]
        drift = {"uru_id": {str(i): True for i in range(820)}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertTrue(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["passed_on"], "all_rows")

    def test_all_rows_path_still_needs_200_compared_rows(self):
        pairs = [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(150)]
        drift = {"uru_id": {str(i): True for i in range(100)}}
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "insufficient_non_drifted")

    def test_zero_denominator_rate_is_none_not_a_fabricated_1_0(self):
        pairs = [("1", {"uru_id": "9"}, {"uru_id": "MISMATCH"})]
        drift = {"uru_id": {"1": True}}  # fully drifted -> non_drifted=0
        report = reconcile_source.compare_matched_fields(pairs, drift=drift)
        self.assertEqual(report["uru_id"]["non_drifted"], 0)
        self.assertIsNone(report["uru_id"]["agreement_non_drifted"])
        self.assertFalse(report["uru_id"]["ok"])
        self.assertEqual(report["uru_id"]["reason"], "insufficient_non_drifted")


class SummaryPrinterHandlesNoneAndGateFailures(unittest.TestCase):
    """Fix round 3: the CLI summary must render a None rate (zero
    denominator) and a non-empty gate_failures list without raising, and
    must actually show both -- a silent gate failure defeats the point of
    naming it."""

    def test_prints_none_rates_as_n_a_without_raising(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            as_of="2026-09-08",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            reconcile_source._print_summary(result)
        output = buf.getvalue()
        self.assertIn("n/a", output)
        self.assertIn("insufficient_non_drifted", output)

    def test_prints_gate_failures_when_present(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=0,
            malformed_export_rows=5,
            db_rows=0,
            matched_ids=set(),
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        self.assertEqual(
            set(result["gate_failures"]),
            {"no_export_rows", "no_matched_rows", "malformed_share_exceeded"},
        )
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            reconcile_source._print_summary(result)
        output = buf.getvalue()
        self.assertIn("no_export_rows", output)
        self.assertIn("malformed_share_exceeded", output)
        self.assertFalse(result["ok"])

    def test_omits_not_yet_emitted_line_when_the_tuple_is_empty(self):
        # NOT_YET_EMITTED is currently (), so the line has nothing to say --
        # printing it anyway ("not yet emitted: ") is just noise.
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            reconcile_source._print_summary(result)
        self.assertNotIn("not yet emitted", buf.getvalue())

    def test_prints_not_yet_emitted_line_when_the_tuple_is_non_empty(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        result["not_yet_emitted"] = ["some_future_field"]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            reconcile_source._print_summary(result)
        output = buf.getvalue()
        self.assertIn("not yet emitted: some_future_field", output)
        self.assertNotIn("Task 6", output)

    def test_prints_none_when_no_gate_failures(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields(
                [(str(i), {"uru_id": "9"}, {"uru_id": "9"}) for i in range(200)]
            ),
        )
        self.assertEqual(result["gate_failures"], [])
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            reconcile_source._print_summary(result)
        self.assertIn("gate_failures: none", buf.getvalue())


class Caveats(unittest.TestCase):
    """Fix round 3, finding 3: the amenities delete-audit blind spot (no
    delete-audit table backs property_amenity_table, so a fully deleted
    amenity set after as_of looks non-drifted) must be visible in the
    result and the CLI summary, not just in a code comment."""

    def test_result_includes_the_amenities_caveat(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        self.assertTrue(any("amenities" in c for c in result["caveats"]))

    def test_cli_summary_prints_the_caveat(self):
        result = reconcile_source._compose_result(
            msa_code="99999",
            export_rows=1,
            malformed_export_rows=0,
            db_rows=1,
            matched_ids={"1"},
            export_only_summary=reconcile_source.summarise_export_only_classifications([]),
            db_only_detail=_empty_db_only_detail(),
            db_only_count=0,
            export_only_count=0,
            field_report=reconcile_source.compare_matched_fields([]),
        )
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            reconcile_source._print_summary(result)
        self.assertIn("amenities", buf.getvalue())


class ReconcileShortCircuitsOnEmptyExport(unittest.TestCase):
    """Fix round 3, run item 4: when the export has zero well-formed rows
    (an empty CSV, or a wrong msa argument that makes _is_malformed reject
    every row), reconcile() must fail fast WITHOUT pulling the database --
    cheaper, and a db_rows/matched count pulled against a CSV describing a
    different market would only be misleading. No network: _load_db is
    monkeypatched to raise if it's ever called."""

    def _csv_path(self, header, rows):
        fh = tempfile.NamedTemporaryFile(
            mode="w", suffix="_20260908.csv", delete=False, newline=""
        )
        writer = csv.writer(fh)
        writer.writerow(header)
        for row in rows:
            writer.writerow(row)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        return fh.name

    def test_empty_export_short_circuits_before_db_pull(self):
        path = self._csv_path(["listing_id", "msa_code"], [])
        with mock.patch.object(
            reconcile_source,
            "_load_db",
            side_effect=AssertionError("must not pull the database"),
        ):
            result = reconcile_source.reconcile("14580", path)
        self.assertFalse(result["ok"])
        self.assertEqual(result["export_rows"], 0)
        self.assertEqual(result["db_rows"], 0)
        self.assertIn("no_export_rows", result["gate_failures"])
        self.assertIn("no_matched_rows", result["gate_failures"])

    def test_all_malformed_wrong_msa_short_circuits_before_db_pull(self):
        # Rows carry msa_code 99999 but the market argument is 14580, so
        # _is_malformed rejects every one of them.
        path = self._csv_path(
            ["listing_id", "msa_code"],
            [["1", "99999"], ["2", "99999"], ["3", "99999"]],
        )
        with mock.patch.object(
            reconcile_source,
            "_load_db",
            side_effect=AssertionError("must not pull the database"),
        ):
            result = reconcile_source.reconcile("14580", path)
        self.assertFalse(result["ok"])
        self.assertEqual(result["malformed_export_rows"], 3)
        self.assertIn("no_export_rows", result["gate_failures"])
        self.assertIn("no_matched_rows", result["gate_failures"])
        self.assertIn("malformed_share_exceeded", result["gate_failures"])


class MainCliArgParsing(unittest.TestCase):
    """The CLI used to parse --as-of/--json by hand
    (`argv[argv.index(...) + 1]`), which raises an unhelpful IndexError when
    the flag is the last argv token with no value. argparse gives a clean,
    documented error (SystemExit) instead."""

    def _csv_path(self, header, rows):
        fh = tempfile.NamedTemporaryFile(
            mode="w", suffix="_20260908.csv", delete=False, newline=""
        )
        writer = csv.writer(fh)
        writer.writerow(header)
        for row in rows:
            writer.writerow(row)
        fh.close()
        self.addCleanup(os.unlink, fh.name)
        return fh.name

    def test_as_of_missing_value_exits_cleanly(self):
        path = self._csv_path(["listing_id", "msa_code"], [])
        with self.assertRaises(SystemExit):
            reconcile_source.main(["14580", path, "--as-of"])

    def test_json_missing_value_exits_cleanly(self):
        path = self._csv_path(["listing_id", "msa_code"], [])
        with self.assertRaises(SystemExit):
            reconcile_source.main(["14580", path, "--json"])

    def test_main_runs_end_to_end_against_an_empty_export(self):
        # No network: an empty (header-only) export short-circuits
        # reconcile() before any database pull (see
        # ReconcileShortCircuitsOnEmptyExport).
        path = self._csv_path(["listing_id", "msa_code"], [])
        with mock.patch.object(
            reconcile_source, "_load_db",
            side_effect=AssertionError("must not pull the database"),
        ):
            exit_code = reconcile_source.main(["14580", path])
        self.assertEqual(exit_code, 1)


if __name__ == "__main__":
    unittest.main()
