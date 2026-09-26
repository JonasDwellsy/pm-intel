"""Tests for the market_listings database reader.

Task 3 scope: pass-through fields only. amenities/photos/address_type land in
Task 4; the six company-identity fields land in Task 6. See field_mapping.md
for the column derivations and their verification status; the population
filter's translation from full_export_view is explained inline in
dwellsy_source.py's WHERE_SQL comments.
"""
import csv
import os
import re
import unittest

import dwellsy_db
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

    def test_amenities_and_photos_are_semicolon_delimited(self):
        # marketing.py splits these on ";" -- the DB reader must match that
        # contract or every marketing score changes silently.
        rows = self.bozeman_rows[:500]
        with_amen = [r for r in rows if r["amenities"]]
        self.assertTrue(with_amen, "no amenities found in 500 rows — mapping wrong")
        for r in with_amen[:20]:
            self.assertNotIn(",,", r["amenities"])
            parts = [x for x in r["amenities"].split(";") if x.strip()]
            self.assertTrue(parts)

    def test_photos_split_into_digit_media_ids(self):
        # photos are emitted as active-media ids (not URLs); each ';'-part
        # must be a bare digit string.
        rows = [r for r in self.bozeman_rows if r["photos"]][:20]
        self.assertTrue(rows, "no photos found in cached Bozeman rows — mapping wrong")
        for r in rows:
            parts = [x for x in r["photos"].split(";") if x.strip()]
            self.assertTrue(parts)
            for part in parts:
                self.assertTrue(part.isdigit(), f"photos part not a digit id: {part!r}")

    def test_address_type_vocabulary_is_closed_and_non_blank(self):
        # pipeline.py lowercases address_type and compares to "house" /
        # "apartment" (see uru_addr_type). The population filter
        # (a1.address_type_id in (1,2,3)) should make aty.address_type always
        # non-null in our population, so the property_category fallback
        # should never fire and no row should have a blank value.
        seen = set()
        for row in self.bozeman_rows:
            value = row["address_type"]
            self.assertTrue(value, "address_type is blank on a row")
            seen.add(value.strip().lower())
        self.assertLessEqual(
            seen, {"apartment", "house", "mobile"},
            f"address_type vocabulary is {sorted(seen)}",
        )
        self.assertIn("apartment", seen)
        self.assertIn("house", seen)

    @unittest.skipUnless(
        os.path.isfile(BOZEMAN_EXPORT), "Bozeman export CSV not present on this machine"
    )
    def test_photo_and_amenity_counts_match_the_export(self):
        # Same contract the pipeline applies (pipeline.py amenities_n/photos_n):
        # count non-blank ';'-parts. Compare that count -- and, for amenities,
        # the raw string -- against the 2026-09-08 export on a deterministic
        # spread sample of listing_ids present on both sides.
        def count_parts(value):
            return len([x for x in value.split(";") if x.strip()]) if value else 0

        by_listing_id = {row["listing_id"]: row for row in self.bozeman_rows}
        matched_pairs = []
        with open(BOZEMAN_EXPORT, newline="", encoding="utf-8") as fh:
            for export_row in csv.DictReader(fh):
                db_row = by_listing_id.get(export_row.get("listing_id"))
                if db_row is not None:
                    matched_pairs.append((export_row.get("listing_id"), db_row, export_row))
        self.assertGreater(len(matched_pairs), 0, "no export rows matched a DB listing_id")

        matched_pairs.sort(key=lambda triple: triple[0])
        sample_size = min(len(matched_pairs), 300)
        step = max(1, len(matched_pairs) // sample_size)
        sample = matched_pairs[::step][:sample_size]

        photo_matches = 0
        amenity_count_matches = 0
        amenity_string_matches = 0
        for listing_id, db_row, export_row in sample:
            db_photo_n = count_parts(db_row.get("photos") or "")
            export_photo_n = count_parts(export_row.get("photos") or "")
            if db_photo_n == export_photo_n:
                photo_matches += 1

            db_amen = db_row.get("amenities") or ""
            export_amen = export_row.get("amenities") or ""
            if count_parts(db_amen) == count_parts(export_amen):
                amenity_count_matches += 1
            if db_amen == export_amen:
                amenity_string_matches += 1

        n = len(sample)
        self.assertGreaterEqual(
            photo_matches / n, 0.93, f"photo count agreement {photo_matches}/{n}"
        )
        self.assertGreaterEqual(
            amenity_count_matches / n, 0.96,
            f"amenity count agreement {amenity_count_matches}/{n}",
        )
        self.assertGreaterEqual(
            amenity_string_matches / n, 0.95,
            f"amenity string agreement {amenity_string_matches}/{n}",
        )

    def test_batched_lookup_equals_correlated_form(self):
        # Fix round 1 replaced Task 4's per-row correlated subqueries with a
        # property-set + chunked-lookup design (see dwellsy_source.py's
        # module docstring). This test pins that the new design's amenities/
        # photos are byte-identical to the ORIGINAL Task 4 expressions
        # (copied verbatim from commit 2f2571a below), on a deterministic
        # spread sample of ~100 Bozeman listing_ids.
        rows_by_id = {r["listing_id"]: r for r in self.bozeman_rows}
        sorted_ids = sorted(rows_by_id, key=lambda lid: int(lid))
        sample_size = min(len(sorted_ids), 100)
        step = max(1, len(sorted_ids) // sample_size)
        sample_ids = sorted_ids[::step][:sample_size]

        # Confirm the parent-merge path in _merge_photo_ids is really
        # exercised by this DB-backed sample, not just asserted vacuously:
        # find which sampled listings have a property with a non-null
        # parent_property_id, then query the PARENT's own media to confirm
        # at least one such parent actually has an active media row (a
        # parent with no media would make the union a no-op).
        def listings_with_parent_media(ids):
            parent_rows = dwellsy_db.query(
                """
                select l.id::text as listing_id, p.parent_property_id
                  from dwellsy_prod.property_listing_table l
                  join dwellsy_prod.property_table p on p.id = l.property_id
                 where l.id = any(%(ids)s::bigint[])
                   and p.parent_property_id is not null
                """,
                {"ids": [int(lid) for lid in ids]},
            )
            if not parent_rows:
                return []
            parent_ids = sorted({r["parent_property_id"] for r in parent_rows})
            media_rows = dwellsy_db.query(
                dwellsy_source.MEDIA_SQL, {"ids": parent_ids}
            )
            parents_with_media = {r["property_id"] for r in media_rows}
            return [
                r["listing_id"]
                for r in parent_rows
                if r["parent_property_id"] in parents_with_media
            ]

        parent_merge_ids = listings_with_parent_media(sample_ids)
        if not parent_merge_ids:
            # The deterministic spread sample happened not to land on a
            # listing whose parent has its own media. Find one
            # deterministically (lowest listing_id under an ORDER BY, not an
            # unordered `limit`) restricted to the SAME BASE_FROM/WHERE_SQL
            # population market_listings uses, so any hit is guaranteed to
            # already be in rows_by_id, and fold it in.
            candidates = dwellsy_db.query(
                """
                select l.id::text as listing_id
                """
                + dwellsy_source.BASE_FROM
                + """
                join dwellsy_prod.property_media_table mp
                  on mp.property_id = p.parent_property_id
                 and mp.property_media_status = 'active'
                 and mp.media_type in ('image', 'floorplan')
                """
                + dwellsy_source.WHERE_SQL
                + """
                 order by l.id
                 limit 1
                """,
                {"msa_code": BOZEMAN},
            )
            found = [r["listing_id"] for r in candidates if r["listing_id"] in rows_by_id]
            self.assertTrue(
                found,
                "no Bozeman listing exercises the parent-media-merge path -- "
                "cannot confirm this DB-backed sample covers it",
            )
            sample_ids = list(dict.fromkeys(sample_ids + found))
            parent_merge_ids = listings_with_parent_media(sample_ids)

        self.assertTrue(
            parent_merge_ids,
            "the sample still does not exercise a parent with its own "
            "media after folding in a deterministic candidate",
        )

        # Verbatim from commit 2f2571a's BASE_SQL (the Task 4 report's
        # "Final SQL added to BASE_SQL"), restricted to the sampled listings.
        original_sql = """
            select l.id::text as listing_id,
                (select string_agg(ad.amenity_name, '; ' order by ad.amenity_name)
                   from (select distinct a.amenity_name
                           from dwellsy_prod.property_amenity_table pa
                           join dwellsy_prod.amenity_table a on a.id = pa.amenity_id
                          where pa.property_id = p.id and a.amenity_name <> 'Other') ad)
                                                     as amenities,
                (select string_agg(mp.id::text, ';' order by mp.id)
                   from dwellsy_prod.property_media_table mp
                  where mp.property_id = any(array[p.id, p.parent_property_id])
                    and mp.property_media_status = 'active'
                    and mp.media_type in ('image', 'floorplan'))
                                                     as photos
              from dwellsy_prod.property_listing_table l
              join dwellsy_prod.property_table p on p.id = l.property_id
             where l.id = any(%(ids)s::bigint[])
        """
        original_rows = dwellsy_db.query(
            original_sql, {"ids": [int(lid) for lid in sample_ids]}
        )
        original_by_id = {r["listing_id"]: r for r in original_rows}

        checked = 0
        for lid in sample_ids:
            db_row = rows_by_id[lid]
            original = original_by_id.get(lid)
            self.assertIsNotNone(
                original, f"listing_id={lid} missing from original-form query"
            )
            self.assertEqual(
                db_row["amenities"],
                original["amenities"] or "",
                f"listing_id={lid} amenities mismatch",
            )
            self.assertEqual(
                db_row["photos"],
                original["photos"] or "",
                f"listing_id={lid} photos mismatch",
            )
            checked += 1
        self.assertEqual(checked, len(sample_ids))

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
        matched_pairs = []
        with open(BOZEMAN_EXPORT, newline="", encoding="utf-8") as fh:
            for export_row in csv.DictReader(fh):
                db_row = by_listing_id.get(export_row.get("listing_id"))
                if db_row is not None:
                    matched_pairs.append((export_row.get("listing_id"), db_row, export_row))
        self.assertGreater(len(matched_pairs), 0, "no export rows matched a DB listing_id")

        # Deterministic spread sample rather than "first N in file order":
        # sort by listing_id and take every Nth pair, capped at a few hundred.
        matched_pairs.sort(key=lambda triple: triple[0])
        sample_size = min(len(matched_pairs), 300)
        step = max(1, len(matched_pairs) // sample_size)
        sample = matched_pairs[::step][:sample_size]

        creation_checked = 0
        both_sides_had_deactivation = 0
        for listing_id, db_row, export_row in sample:
            self.assertEqual(
                db_row["creation_time"],
                export_row["creation_time"],
                f"listing_id={listing_id} creation_time mismatch",
            )
            creation_checked += 1

            db_deact = db_row["deactivation_time"]
            export_deact = export_row["deactivation_time"]
            if db_deact and export_deact:
                both_sides_had_deactivation += 1
            if db_deact == export_deact:
                continue
            # Tolerate exactly one explained mismatch class: export blank,
            # DB non-blank -- the listing closed after the 2026-09-08 pull
            # (field_mapping.md: 8/1000 such rows). Every other mismatch
            # (including DB blank / export non-blank, which would mean the
            # DB thinks a closed listing is still open) fails the test.
            if export_deact == "" and db_deact != "":
                continue
            self.fail(
                f"listing_id={listing_id} deactivation_time mismatch: "
                f"db={db_deact!r} export={export_deact!r}"
            )

        self.assertGreater(creation_checked, 0)
        self.assertGreater(
            both_sides_had_deactivation,
            0,
            "sample had no rows with a non-blank deactivation_time on both "
            "sides -- the parity check would pass vacuously",
        )


class MergePhotoIds(unittest.TestCase):
    """Pure unit tests for the photo-merge helper -- no network, no
    skipUnless gate, so these run even without Dwellsy DB credentials."""

    def test_union_of_own_and_parent(self):
        self.assertEqual(dwellsy_source._merge_photo_ids([5, 3], [3, 10]), "3;5;10")

    def test_no_ids_on_either_side(self):
        self.assertEqual(dwellsy_source._merge_photo_ids([], []), "")


class AttachAmenitiesAndPhotos(unittest.TestCase):
    """Pure unit tests for the phase-3 late-lookup fallback (Fix round 2) --
    no network, no skipUnless gate. A fake `lookup_fn` stands in for
    `_batched_lookups` so the "property phase 1 never saw" path can be
    exercised deterministically."""

    def setUp(self):
        dwellsy_source.LAST_RUN_STATS.clear()
        dwellsy_source.LAST_RUN_STATS["late_lookups"] = 0

    def test_late_lookup_fills_a_property_phase_1_missed(self):
        row = {"_property_id": 555, "_parent_property_id": None}
        amenities_by_property = {}
        media_by_property = {}
        looked_up_ids = set()  # phase 1 never saw 555

        def fake_lookup(ids):
            self.assertEqual(ids, [555])
            return {555: "Pool; Gym"}, {555: [2, 1]}

        out = dwellsy_source._attach_amenities_and_photos(
            row,
            amenities_by_property,
            media_by_property,
            looked_up_ids,
            lookup_fn=fake_lookup,
        )

        self.assertEqual(out["amenities"], "Pool; Gym")
        self.assertEqual(out["photos"], "1;2")
        self.assertEqual(out["property_id"], "555")
        self.assertIn(555, looked_up_ids)
        self.assertEqual(dwellsy_source.LAST_RUN_STATS["late_lookups"], 1)

    def test_late_lookup_covers_both_property_and_missing_parent(self):
        row = {"_property_id": 10, "_parent_property_id": 20}
        amenities_by_property = {10: "Pool"}  # property already known
        media_by_property = {10: [1]}
        looked_up_ids = {10}  # parent (20) was NOT in phase 1's set

        def fake_lookup(ids):
            self.assertEqual(ids, [20])
            return {}, {20: [9]}

        out = dwellsy_source._attach_amenities_and_photos(
            row,
            amenities_by_property,
            media_by_property,
            looked_up_ids,
            lookup_fn=fake_lookup,
        )

        self.assertEqual(out["amenities"], "Pool")
        self.assertEqual(out["photos"], "1;9")
        self.assertIn(20, looked_up_ids)
        self.assertEqual(dwellsy_source.LAST_RUN_STATS["late_lookups"], 1)

    def test_already_looked_up_property_does_not_trigger_a_late_lookup(self):
        row = {"_property_id": 7, "_parent_property_id": None}
        amenities_by_property = {7: "Pool"}
        media_by_property = {7: [9]}
        looked_up_ids = {7}

        def fail_lookup(ids):
            self.fail(f"lookup_fn should not be called; got ids={ids!r}")

        out = dwellsy_source._attach_amenities_and_photos(
            row,
            amenities_by_property,
            media_by_property,
            looked_up_ids,
            lookup_fn=fail_lookup,
        )

        self.assertEqual(out["amenities"], "Pool")
        self.assertEqual(out["photos"], "9")
        self.assertEqual(dwellsy_source.LAST_RUN_STATS["late_lookups"], 0)
