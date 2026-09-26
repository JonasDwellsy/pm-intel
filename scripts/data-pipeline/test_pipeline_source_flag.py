"""Behavioral tests for pipeline.py's --source/--db-snapshot flags.

Runs pipeline.py as a subprocess rather than importing it: the module does
real work at import time (argparse, a market lookup, an input-existence
check -- see pipeline.py's top), so importing it under a test's control
would mean either standing up a real data-dir or fighting that top-level
code. --help and the flag-combination error both resolve before any of
that heavy work runs, so driving them as a subprocess is both simpler and
closer to how the flags are actually invoked.
"""
import os
import subprocess
import sys
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


if __name__ == "__main__":
    unittest.main()
