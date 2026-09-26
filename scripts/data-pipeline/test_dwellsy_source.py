"""Tests for the market_listings database reader.

Task 3 scope: pass-through fields only. amenities/photos/address_type land in
Task 4; the six company-identity fields land in Task 6. See field_mapping.md
for the column derivations and their verification status, and
task-3-report.md for how the population filter was translated from
full_export_view.
"""
import csv
import os
import re
import unittest

import dwellsy_source

SECRET = os.path.expanduser("~/Documents/Dwellsy/secrets/db_connection.txt")
BOZEMAN = "14580"
BOZEMAN_EXPORT = (
    "/Users/jonasbordo/Documents/Claude/Projects/Product Support/"
    "merged_bozeman-mt_20260908.csv"
)

PASSTHROUGH_KEYS = (
    "uru_id", "msa_code", "rent_amount", "creation_time",
    "deactivation_time", "property_listing_status",
    "bedrooms", "latitude", "longitude", "address_1",
    "address_city", "community_id", "address1_id",
    "description", "top_down_community_count",
    "listing_id", "company_id",
)


@unittest.skipUnless(os.path.isfile(SECRET), "no Dwellsy credentials on this machine")
class MarketListings(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bozeman_rows = list(dwellsy_source.market_listings(BOZEMAN))

    def test_rows_carry_the_passthrough_keys(self):
        row = self.bozeman_rows[0]
        for key in PASSTHROUGH_KEYS:
            self.assertIn(key, row)

    def test_every_row_is_the_requested_market(self):
        for row in self.bozeman_rows:
            self.assertEqual(row["msa_code"], BOZEMAN)

    def test_uru_coverage_is_total(self):
        missing = [r for r in self.bozeman_rows if not r.get("uru_id")]
        self.assertEqual(missing, [], "uru_id was 100% on 2026-09-26; a drop is a bug")

    def test_no_row_multiplication(self):
        # A join through a many-to-many bridge silently inflates counts.
        # One row per listing_id, no more.
        ids = [r["listing_id"] for r in self.bozeman_rows]
        self.assertEqual(len(ids), len(set(ids)))

    def test_population_is_the_filtered_set(self):
        # full_export_view's own filters, minus the apartment-only clause,
        # minus its hard-coded date floor/window: measured 18,670 on
        # 2026-09-26 (raw unfiltered Bozeman 21,863; the 2026-09-08 CSV
        # export 12,935). Allow live drift within a wide band.
        self.assertGreater(len(self.bozeman_rows), 18000)
        self.assertLess(len(self.bozeman_rows), 19500)

    def test_timestamps_are_pacific_wall_clock(self):
        ts_re = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")
        checked = 0
        for row in self.bozeman_rows:
            for key in ("creation_time", "deactivation_time"):
                value = row[key]
                if value:
                    self.assertRegex(value, ts_re, f"{key}={value!r} carries an offset")
                    checked += 1
        self.assertGreater(checked, 0)

    @unittest.skipUnless(
        os.path.isfile(BOZEMAN_EXPORT), "Bozeman export CSV not present on this machine"
    )
    def test_timestamps_match_the_export_on_matched_rows(self):
        # Embedded newlines inside description fields mean this file must be
        # read with the csv module, never wc -l or naive line-splitting.
        by_listing_id = {row["listing_id"]: row for row in self.bozeman_rows}
        matched = 0
        with open(BOZEMAN_EXPORT, newline="", encoding="utf-8") as fh:
            for export_row in csv.DictReader(fh):
                db_row = by_listing_id.get(export_row.get("listing_id"))
                if db_row is None:
                    continue
                matched += 1
                self.assertEqual(
                    db_row["creation_time"],
                    export_row["creation_time"],
                    f"listing_id={export_row.get('listing_id')} creation_time mismatch",
                )
                if matched >= 50:
                    break
        self.assertGreater(matched, 0, "no export rows matched a DB listing_id")
