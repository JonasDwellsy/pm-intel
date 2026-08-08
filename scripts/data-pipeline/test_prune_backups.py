"""Tests for merge.py's snapshot pruning.

This function deletes files, so the properties that matter are: it keeps the
NEWEST ones, it never reaches outside its own target's snapshots, and it cannot
fail a merge. Run: python3 scripts/data-pipeline/test_prune_backups.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from merge import prune_backups, KEEP_BACKUPS  # noqa: E402

BASE = "scorecard_data.json"


def make(d, names):
    for n in names:
        with open(os.path.join(d, n), "w") as f:
            f.write("x" * 10)


def names(d):
    return sorted(os.listdir(d))


def test_keeps_the_newest_three():
    with tempfile.TemporaryDirectory() as d:
        make(d, [f"{BASE}.2026080{i}T120000.bak" for i in range(1, 7)])
        prune_backups(d, BASE)
        kept = names(d)
        assert len(kept) == 3, kept
        # Newest by embedded timestamp, not by mtime — all six were written
        # within the same instant here, so mtime ordering would be arbitrary.
        assert kept == [
            f"{BASE}.20260804T120000.bak",
            f"{BASE}.20260805T120000.bak",
            f"{BASE}.20260806T120000.bak",
        ], kept
    print("  ok: keeps the newest three")


def test_leaves_other_targets_alone():
    # .backups/ is shared. Pruning one target must not touch another's history.
    with tempfile.TemporaryDirectory() as d:
        make(d, [f"{BASE}.2026080{i}T120000.bak" for i in range(1, 6)])
        make(d, [f"other.json.2026080{i}T120000.bak" for i in range(1, 6)])
        prune_backups(d, BASE)
        others = [f for f in names(d) if f.startswith("other.json")]
        assert len(others) == 5, others
    print("  ok: only prunes its own target")


def test_noop_when_under_the_cap():
    with tempfile.TemporaryDirectory() as d:
        wanted = [f"{BASE}.2026080{i}T120000.bak" for i in (1, 2)]
        make(d, wanted)
        removed = prune_backups(d, BASE)
        assert removed == [], removed
        assert names(d) == sorted(wanted)
    print("  ok: no-op below the cap")


def test_ignores_unrelated_files():
    with tempfile.TemporaryDirectory() as d:
        make(d, [f"{BASE}.2026080{i}T120000.bak" for i in range(1, 6)])
        make(d, ["README.md", f"{BASE}", f"{BASE}.20260801T120000.bak.tmp"])
        prune_backups(d, BASE)
        left = names(d)
        assert "README.md" in left and BASE in left, left
        # A partial/temp file is not a snapshot and must survive.
        assert f"{BASE}.20260801T120000.bak.tmp" in left, left
    print("  ok: ignores non-snapshot files")


def test_missing_directory_is_not_an_error():
    # A first-ever merge has no .backups/ yet; cleanup must not explode.
    assert prune_backups("/nonexistent/path/.backups", BASE) == []
    print("  ok: missing directory is a no-op")


def test_reports_what_it_freed():
    with tempfile.TemporaryDirectory() as d:
        make(d, [f"{BASE}.2026080{i}T120000.bak" for i in range(1, 6)])
        removed = prune_backups(d, BASE)
        assert len(removed) == 2, removed
        assert all(sz == 10 for _, sz in removed), removed
    print("  ok: reports removed files and bytes")


if __name__ == "__main__":
    assert KEEP_BACKUPS == 3, KEEP_BACKUPS
    for fn in [v for k, v in sorted(globals().items()) if k.startswith("test_")]:
        fn()
    print("all prune_backups tests passed")
