"""Tests for the db_snapshot module: no network, temp dirs only.

`dwellsy_source.market_listings` is never called here -- every `pull` is a
fake the test controls, so these tests say nothing about the database
reader itself (see test_dwellsy_source.py for that). What's under test is
the snapshot file's write/reuse contract: one CSV plus a JSON sidecar,
written atomically, reused when a caller already has one, pulled fresh
otherwise.
"""
import csv
import json
import os
import tempfile
import unittest
from datetime import date, datetime, timezone

import db_snapshot
import dwellsy_source


class WriteReadRoundTrip(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = os.path.join(self._tmp.name, "snapshot.csv")

    def test_round_trips_rows_with_embedded_newline_and_comma(self):
        rows = [
            {"listing_id": "1", "description": "great place,\nquiet street"},
            {"listing_id": "2", "description": "no surprises"},
        ]
        meta_in = {"msa_code": "14580", "pulled_at": "2026-09-26T10:00:00+00:00",
                   "pulled_on_pacific": "2026-09-26", "source": "dwellsy_db"}

        returned_meta = db_snapshot.write_snapshot(rows, self.path, meta_in)

        with open(self.path, newline="", encoding="utf-8") as fh:
            read_back = list(csv.DictReader(fh))
        self.assertEqual(read_back, rows)
        self.assertEqual(returned_meta["row_count"], 2)

    def test_writes_a_meta_sidecar_readable_via_read_meta(self):
        rows = [{"listing_id": "1"}]
        meta_in = {"msa_code": "14580", "pulled_at": "2026-09-26T10:00:00+00:00",
                   "pulled_on_pacific": "2026-09-26", "source": "dwellsy_db"}

        db_snapshot.write_snapshot(rows, self.path, meta_in)

        self.assertTrue(os.path.isfile(self.path + ".meta.json"))
        meta = db_snapshot.read_meta(self.path)
        self.assertEqual(meta["msa_code"], "14580")
        self.assertEqual(meta["row_count"], 1)
        self.assertIn("reader_stats", meta)

    def test_row_count_and_reader_stats_reflect_the_full_pull(self):
        dwellsy_source.LAST_RUN_STATS.clear()
        dwellsy_source.LAST_RUN_STATS["late_lookups"] = 3
        rows = [{"a": "1"}, {"a": "2"}, {"a": "3"}]
        meta_in = {"msa_code": "14580", "pulled_at": "x", "pulled_on_pacific": "2026-09-26"}

        meta = db_snapshot.write_snapshot(rows, self.path, meta_in)

        self.assertEqual(meta["row_count"], 3)
        self.assertEqual(meta["reader_stats"], {"late_lookups": 3})

    def test_a_later_row_with_an_unheadered_key_fails_loudly(self):
        rows = [{"a": "1"}, {"a": "2", "b": "unexpected"}]
        meta_in = {"msa_code": "14580", "pulled_at": "x", "pulled_on_pacific": "2026-09-26"}

        with self.assertRaises(ValueError):
            db_snapshot.write_snapshot(rows, self.path, meta_in)


class AtomicWrite(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = os.path.join(self._tmp.name, "snapshot.csv")

    def test_a_pull_that_raises_midway_leaves_no_final_file_and_no_stray_temp(self):
        def _rows():
            yield {"a": "1"}
            yield {"a": "2"}
            raise RuntimeError("connection dropped")

        meta_in = {"msa_code": "14580", "pulled_at": "x", "pulled_on_pacific": "2026-09-26"}

        with self.assertRaises(RuntimeError):
            db_snapshot.write_snapshot(_rows(), self.path, meta_in)

        self.assertFalse(os.path.isfile(self.path))
        self.assertFalse(os.path.isfile(self.path + ".meta.json"))
        self.assertEqual(os.listdir(self._tmp.name), [])


class EnsureSnapshot(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.out_dir = self._tmp.name

    def _fail_if_called(self, msa_code):
        self.fail("pull should not have been called")

    def test_reuses_an_existing_snapshot_without_calling_pull(self):
        path = os.path.join(self.out_dir, "existing.csv")
        db_snapshot.write_snapshot(
            [{"a": "1"}], path,
            {"msa_code": "14580", "pulled_at": "x", "pulled_on_pacific": "2026-09-01"},
        )

        returned_path, meta = db_snapshot.ensure_snapshot(
            "14580", self.out_dir, "bozeman", snapshot_path=path, pull=self._fail_if_called,
        )

        self.assertEqual(returned_path, path)
        self.assertEqual(meta["pulled_on_pacific"], "2026-09-01")

    def test_pulls_when_the_named_path_is_missing(self):
        path = os.path.join(self.out_dir, "missing.csv")
        calls = []

        def _pull(msa_code):
            calls.append(msa_code)
            yield {"a": "1"}

        returned_path, meta = db_snapshot.ensure_snapshot(
            "14580", self.out_dir, "bozeman", snapshot_path=path, pull=_pull,
        )

        self.assertEqual(calls, ["14580"])
        self.assertTrue(os.path.isfile(path))
        self.assertEqual(meta["row_count"], 1)

    def test_pulls_to_the_default_path_when_none_is_named(self):
        def _pull(msa_code):
            yield {"a": "1"}

        returned_path, meta = db_snapshot.ensure_snapshot(
            "14580", self.out_dir, "bozeman", snapshot_path=None, pull=_pull,
        )

        pacific_today = datetime.now(timezone.utc).astimezone(db_snapshot.PACIFIC).date()
        self.assertEqual(
            returned_path, db_snapshot.default_snapshot_path(self.out_dir, "bozeman", pacific_today)
        )
        self.assertTrue(os.path.isfile(returned_path))

    def test_msa_mismatch_in_the_existing_meta_raises(self):
        path = os.path.join(self.out_dir, "wrong-market.csv")
        db_snapshot.write_snapshot(
            [{"a": "1"}], path,
            {"msa_code": "12060", "pulled_at": "x", "pulled_on_pacific": "2026-09-01"},
        )

        with self.assertRaises(ValueError):
            db_snapshot.ensure_snapshot(
                "14580", self.out_dir, "bozeman", snapshot_path=path, pull=self._fail_if_called,
            )

    def test_a_truncated_snapshot_is_refused(self):
        path = os.path.join(self.out_dir, "truncated.csv")
        db_snapshot.write_snapshot(
            [{"a": "1"}, {"a": "2"}, {"a": "3"}], path,
            {"msa_code": "14580", "pulled_at": "x", "pulled_on_pacific": "2026-09-01"},
        )
        with open(path, "r+", encoding="utf-8") as fh:
            fh.truncate(os.path.getsize(path) - 2)

        with self.assertRaises(ValueError):
            db_snapshot.ensure_snapshot(
                "14580", self.out_dir, "bozeman", snapshot_path=path, pull=self._fail_if_called,
            )

    def test_meta_records_the_file_size_and_leaves_no_temp_files(self):
        path = os.path.join(self.out_dir, "sized.csv")
        meta = db_snapshot.write_snapshot(
            [{"a": "1"}], path,
            {"msa_code": "14580", "pulled_at": "x", "pulled_on_pacific": "2026-09-01"},
        )
        self.assertEqual(meta["size_bytes"], os.path.getsize(path))
        self.assertEqual(sorted(os.listdir(self.out_dir)), ["sized.csv", "sized.csv.meta.json"])


class DefaultSnapshotPath(unittest.TestCase):
    def test_format(self):
        got = db_snapshot.default_snapshot_path("/out", "bozeman", date(2026, 9, 26))
        self.assertEqual(got, "/out/db_snapshot_bozeman_20260926.csv")


class PulledOnPacific(unittest.TestCase):
    def test_a_utc_instant_just_after_midnight_is_the_previous_pacific_date(self):
        # 2026-09-26 00:30 UTC is 2026-09-25 17:30 Pacific (PDT, UTC-7).
        just_after_midnight_utc = datetime(2026, 9, 26, 0, 30, tzinfo=timezone.utc)
        self.assertEqual(
            db_snapshot._pulled_on_pacific(just_after_midnight_utc), "2026-09-25"
        )


if __name__ == "__main__":
    unittest.main()
