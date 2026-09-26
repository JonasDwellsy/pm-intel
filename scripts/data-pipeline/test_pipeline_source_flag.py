"""Behavioral tests for pipeline.py's --source/--db-snapshot flags.

Runs pipeline.py as a subprocess rather than importing it: the module does
real work at import time (argparse, a market lookup, an input-existence
check -- see pipeline.py's top), so importing it under a test's control
would mean either standing up a real data-dir or fighting that top-level
code. --help and the flag-combination error both resolve before any of
that heavy work runs, so driving them as a subprocess is both simpler and
closer to how the flags are actually invoked.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_PY = os.path.join(PIPELINE_DIR, "pipeline.py")


def _run(args):
    return subprocess.run(
        [sys.executable, PIPELINE_PY, *args],
        cwd=PIPELINE_DIR,
        capture_output=True,
        text=True,
        timeout=30,
    )


class SourceFlag(unittest.TestCase):
    def test_help_lists_source_defaulting_to_csv(self):
        result = _run(["--help"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("--source", result.stdout)
        self.assertIn("default: csv", result.stdout)

    def test_help_lists_db_snapshot(self):
        result = _run(["--help"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("--db-snapshot", result.stdout)

    def test_db_snapshot_without_source_db_is_rejected_before_heavy_work(self):
        # --market and --data-dir both point at nonsense. If the
        # flag-combination check ran after the market lookup or the
        # data-dir existence check instead of right after parsing, this
        # would fail for THAT reason first and the test would be asserting
        # the wrong thing -- a pass here means the check truly runs first.
        result = _run([
            "--market", "does-not-exist",
            "--data-dir", "/no/such/directory",
            "--source", "csv",
            "--db-snapshot", "/tmp/whatever.csv",
        ])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--db-snapshot", result.stderr)
        self.assertIn("--source db", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_missing_national_lookup_is_caught_before_the_db_pull(self):
        # An empty --data-dir has no national lookup file, and no
        # credentials are configured to reach the database from this
        # subprocess either -- if the check ran only in the combined loop
        # AFTER the pull (the pre-fix order), this would instead fail on the
        # pull itself (or hang), not on this message.
        with tempfile.TemporaryDirectory() as tmp:
            result = _run([
                "--market", "bozeman-mt",
                "--data-dir", tmp,
                "--source", "db",
            ])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing input (nationalLookup)", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_msa_code_35620_is_refused_for_source_db(self):
        # New York is out of scope for the database source -- a custom
        # --config supplies a fake market at msaCode 35620 (the real
        # markets.json has no New York entry at all) so this never needs a
        # database connection to prove the refusal fires.
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "national_lookup.json"), "w") as fh:
                fh.write("{}")
            config_path = os.path.join(tmp, "markets.json")
            with open(config_path, "w") as fh:
                json.dump({
                    "nationalLookup": "national_lookup.json",
                    "markets": [{"id": "new-york-ny", "msaCode": "35620"}],
                }, fh)
            result = _run([
                "--market", "new-york-ny",
                "--config", config_path,
                "--data-dir", tmp,
                "--source", "db",
            ])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("35620", result.stderr)
        self.assertIn("out of scope", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_as_of_later_than_snapshot_pulled_on_pacific_is_refused(self):
        # A reused --db-snapshot (existing file + matching .meta.json) never
        # touches the network, so this proves the refusal without a live
        # database pull.
        with tempfile.TemporaryDirectory() as tmp:
            with open(
                os.path.join(tmp, "Operator_National_Urus_v0.6.2.json"), "w"
            ) as fh:
                fh.write("{}")
            snapshot_path = os.path.join(tmp, "db_snapshot_bozeman_20260101.csv")
            with open(snapshot_path, "w", newline="") as fh:
                fh.write("listing_id\n1\n")
            meta = {
                "msa_code": "14580",
                "pulled_at": "2026-01-01T10:00:00+00:00",
                "pulled_on_pacific": "2026-01-01",
                "source": "dwellsy_db",
                "row_count": 1,
                "size_bytes": os.path.getsize(snapshot_path),
                "reader_stats": {},
            }
            with open(snapshot_path + ".meta.json", "w") as fh:
                json.dump(meta, fh)

            result = _run([
                "--market", "bozeman-mt",
                "--data-dir", tmp,
                "--source", "db",
                "--db-snapshot", snapshot_path,
                "--as-of", "2026-06-01",
            ])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--as-of", result.stderr)
        self.assertIn("2026-01-01", result.stderr)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
