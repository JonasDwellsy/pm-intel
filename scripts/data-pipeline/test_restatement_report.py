"""Tests for restatement_report.py.

Fixtures are small, hand-built JSON dicts using the REAL per-market output
key structure (checked directly against a live run's
Scorecard_Data_v0.6.4_bozeman.json and Scorecard_Data_v0.6.4_kansas-city.json
during Task 8): pms[].{slug, name, marketId, companyId, parentCompanyId,
canonicalOperatorId, coverage.{t12Listings, dataTier}, performance.{domT12,
domStar}, rentPerformance.{pmYoyChange, star}, tenancy.{retention18Pct,
star}, marketing.{photosScore, compositeScore, star}}, plus a top-level
markets[0] aggregate block. No network, no real pipeline run.
"""
import json
import os
import tempfile
import unittest

import restatement_report as rr


def _pm(slug, name="Op", marketId="test-market", t12=54, tier="Full ranking",
        companyId=None, parentCompanyId=None, canonicalOperatorId=None,
        domT12=25.0, domStar="silver", pmYoyChange=0.05, rentStar="gold",
        retention18Pct=70.0, tenancyStar="gold", photosScore=40.0,
        medianPhotosT12=8.0, compositeScore=60.0, marketingStar=None,
        quadrant7Cell="SFR Independent"):
    return {
        "slug": slug,
        "name": name,
        "marketId": marketId,
        "companyId": companyId if companyId is not None else slug,
        "parentCompanyId": parentCompanyId,
        "canonicalOperatorId": canonicalOperatorId if canonicalOperatorId is not None else slug,
        "quadrant7Cell": quadrant7Cell,
        "coverage": {"t12Listings": t12, "dataTier": tier},
        "performance": {"domT12": domT12, "domStar": domStar},
        "rentPerformance": {"pmYoyChange": pmYoyChange, "star": rentStar},
        "tenancy": {"retention18Pct": retention18Pct, "star": tenancyStar},
        "marketing": {"photosScore": photosScore, "medianPhotosT12": medianPhotosT12,
                      "compositeScore": compositeScore, "star": marketingStar},
    }


def _doc(pms, market_summary=None):
    d = {
        "$schema": "test",
        "methodologyVersion": "v0.7",
        "dataAsOf": "2026-09-08",
        "pms": pms,
    }
    if market_summary is not None:
        d["markets"] = [market_summary]
    return d


class TmpJsonMixin:
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)

    def _write(self, name, doc):
        path = os.path.join(self._tmp.name, name)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh)
        return path


class GainedLostDetection(TmpJsonMixin, unittest.TestCase):
    def test_gained_and_lost_slugs_identified(self):
        csv_doc = _doc([_pm("a"), _pm("b")])
        db_doc = _doc([_pm("a"), _pm("c")])
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        out = rr.report(csv_path, db_path)

        self.assertIn("Gained operators", out)
        self.assertIn("| Op | ", out)  # gained-operator table row exists
        self.assertIn("Lost operators", out)
        # b (lost) and c (gained) must both be discoverable in the markdown
        self.assertIn("b", out)
        self.assertIn("c", out)

    def test_no_diff_when_identical_slug_sets(self):
        csv_doc = _doc([_pm("a"), _pm("b")])
        db_doc = _doc([_pm("a"), _pm("b")])
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        out = rr.report(csv_path, db_path)

        self.assertIn("No operator lost scored status.", out)
        self.assertIn("No newly-scored operators.", out)
        self.assertIn("| No unexplained lost operators | PASS |", out)


class LostOperatorExplanation(TmpJsonMixin, unittest.TestCase):
    def test_unexplained_loss_is_flagged_loudly(self):
        csv_doc = _doc([_pm("a"), _pm("b", companyId="999", canonicalOperatorId="b")])
        db_doc = _doc([_pm("a")])  # b genuinely absent; no id match anywhere
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        out = rr.report(csv_path, db_path)

        self.assertIn("UNEXPLAINED", out)
        self.assertIn("| No unexplained lost operators | FAIL |", out)

    def test_loss_explained_by_rename_or_merge_elsewhere(self):
        # "b" disappears under its old slug but its companyId (999) resurfaces
        # under a new slug "b-renamed" in the db output -- a merge/rename,
        # not a real loss.
        csv_doc = _doc([_pm("a"), _pm("b", companyId="999", canonicalOperatorId="b")])
        db_doc = _doc([_pm("a"), _pm("b-renamed", companyId="999", canonicalOperatorId="b-renamed")])
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        out = rr.report(csv_path, db_path)

        self.assertIn("EXPLAINED", out)
        self.assertIn("b-renamed", out)
        self.assertNotIn("UNEXPLAINED", out)
        self.assertIn("| No unexplained lost operators | PASS |", out)

    def test_loss_explained_by_manual_note_override(self):
        csv_doc = _doc([_pm("a"), _pm("b", companyId="999", canonicalOperatorId="b", t12=54)])
        db_doc = _doc([_pm("a")])
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        out = rr.report(csv_path, db_path,
                         lost_operator_notes={"b": "T12 collapsed below the eligibility floor in the db pull"})

        self.assertIn("EXPLAINED — T12 collapsed below the eligibility floor", out)
        self.assertNotIn("UNEXPLAINED", out)
        self.assertIn("| No unexplained lost operators | PASS |", out)


class StarChangeCounting(TmpJsonMixin, unittest.TestCase):
    def test_star_buckets_classified_correctly(self):
        # DOM star deltas, all with domT12 present on both sides (so all 7
        # slugs count in n): unchanged, up1, up2+ (bronze->gold), down1,
        # down2+ (gold->bronze), plus "gained" (None->silver) and "lost"
        # (gold->None) -- a star appearing/disappearing is reported as its
        # own count, not forced into the up2+/down2+ buckets.
        csv_pms = [
            _pm("unchanged", domT12=10.0, domStar="gold"),
            _pm("up1", domT12=10.0, domStar="silver"),
            _pm("up2plus", domT12=10.0, domStar="bronze"),
            _pm("down1", domT12=10.0, domStar="silver"),
            _pm("down2plus", domT12=10.0, domStar="gold"),
            _pm("gained", domT12=10.0, domStar=None),
            _pm("lost", domT12=10.0, domStar="gold"),
        ]
        db_pms = [
            _pm("unchanged", domT12=12.0, domStar="gold"),
            _pm("up1", domT12=12.0, domStar="gold"),
            _pm("up2plus", domT12=12.0, domStar="gold"),
            _pm("down1", domT12=12.0, domStar="bronze"),
            _pm("down2plus", domT12=12.0, domStar="bronze"),
            _pm("gained", domT12=12.0, domStar="silver"),
            _pm("lost", domT12=12.0, domStar=None),
        ]
        csv_path = self._write("csv.json", _doc(csv_pms))
        db_path = self._write("db.json", _doc(db_pms))

        both = sorted(p["slug"] for p in csv_pms)
        ap = rr._index(_doc(csv_pms))
        bp = rr._index(_doc(db_pms))

        lines = rr._metric_movements_section(both, ap, bp)
        text = "\n".join(lines)
        # DOM row: n=7, unchanged=1, up1=1, up2+=1, down1=1, down2+=1, gained/lost=2
        dom_row = next(l for l in lines if l.startswith("| DOM"))
        cells = [c.strip() for c in dom_row.strip("|").split("|")]
        # cells: label, n, median|delta|, unchanged, up1, up2+, down1, down2+, rating gained/lost
        self.assertEqual(cells[1], "7")
        self.assertEqual(cells[3], "1")  # unchanged
        self.assertEqual(cells[4], "1")  # up1
        self.assertEqual(cells[5], "1")  # up2+
        self.assertEqual(cells[6], "1")  # down1
        self.assertEqual(cells[7], "1")  # down2+
        self.assertEqual(cells[8], "2")  # rating gained/lost

    def test_rating_gained_or_lost_excluded_from_star_buckets(self):
        # A star appearing/disappearing (no rating on one side) must not be
        # miscounted as an up2+/down2+ swing -- it's a coverage change, not
        # a 2+ tier jump.
        csv_pms = [
            _pm("gained", domT12=10.0, domStar=None),
            _pm("lost", domT12=10.0, domStar="gold"),
        ]
        db_pms = [
            _pm("gained", domT12=12.0, domStar="bronze"),
            _pm("lost", domT12=12.0, domStar=None),
        ]
        both = ["gained", "lost"]
        ap = rr._index(_doc(csv_pms))
        bp = rr._index(_doc(db_pms))

        lines = rr._metric_movements_section(both, ap, bp)
        dom_row = next(l for l in lines if l.startswith("| DOM"))
        cells = [c.strip() for c in dom_row.strip("|").split("|")]
        self.assertEqual(cells[1], "2")
        self.assertEqual(cells[3:8], ["0", "0", "0", "0", "0"])
        self.assertEqual(cells[8], "2")


class MedianChangeMaths(TmpJsonMixin, unittest.TestCase):
    def test_median_absolute_change_computed_correctly(self):
        # domT12 csv values 10, 20, 30 -> db values 15, 20, 45
        # abs diffs: 5, 0, 15 -> median = 5
        csv_pms = [_pm("x", domT12=10.0), _pm("y", domT12=20.0), _pm("z", domT12=30.0)]
        db_pms = [_pm("x", domT12=15.0), _pm("y", domT12=20.0), _pm("z", domT12=45.0)]
        ap = rr._index(_doc(csv_pms))
        bp = rr._index(_doc(db_pms))
        both = ["x", "y", "z"]

        lines = rr._metric_movements_section(both, ap, bp)
        dom_row = next(l for l in lines if l.startswith("| DOM"))
        cells = [c.strip() for c in dom_row.strip("|").split("|")]
        self.assertEqual(cells[2], "5.0")  # median |delta|, formatted "%.1f"

    def test_median_ignores_missing_values_on_either_side(self):
        csv_pms = [_pm("x", domT12=10.0), _pm("y", domT12=None), _pm("z", domT12=30.0)]
        db_pms = [_pm("x", domT12=12.0), _pm("y", domT12=99.0), _pm("z", domT12=None)]
        ap = rr._index(_doc(csv_pms))
        bp = rr._index(_doc(db_pms))
        both = ["x", "y", "z"]

        lines = rr._metric_movements_section(both, ap, bp)
        dom_row = next(l for l in lines if l.startswith("| DOM"))
        cells = [c.strip() for c in dom_row.strip("|").split("|")]
        # Only "x" has both non-null (|12-10|=2); n=1
        self.assertEqual(cells[1], "1")
        self.assertEqual(cells[2], "2.0")


class MarketingPhotoSection(TmpJsonMixin, unittest.TestCase):
    def test_distribution_and_star_change_count(self):
        csv_pms = [
            _pm("a", photosScore=10.0, compositeScore=30.0, marketingStar=None),
            _pm("b", photosScore=20.0, compositeScore=50.0, marketingStar="silver"),
            _pm("c", photosScore=30.0, compositeScore=70.0, marketingStar="gold"),
        ]
        db_pms = [
            _pm("a", photosScore=40.0, compositeScore=60.0, marketingStar="silver"),  # star changed
            _pm("b", photosScore=50.0, compositeScore=80.0, marketingStar="silver"),  # unchanged
            _pm("c", photosScore=60.0, compositeScore=90.0, marketingStar="gold"),  # unchanged
        ]
        ap = rr._index(_doc(csv_pms))
        bp = rr._index(_doc(db_pms))
        both = ["a", "b", "c"]

        lines = rr._marketing_photo_section(ap, bp, both)
        text = "\n".join(lines)
        self.assertIn("Photos sub-score", text)
        self.assertIn("Marketing composite", text)
        self.assertIn("Marketing star changed for 1 / 3 operators", text)
        self.assertNotIn("Task 5", text)
        self.assertNotIn("task-5-report", text)

    def test_photo_narrative_states_the_measured_direction(self):
        # Bozeman's own numbers came out LOWER on the db side, not higher --
        # the narrative must derive its direction word from the actual
        # distributions instead of assuming "higher" every time.
        csv_pms = [_pm("a", medianPhotosT12=20.0), _pm("b", medianPhotosT12=20.0)]
        db_pms = [_pm("a", medianPhotosT12=10.0), _pm("b", medianPhotosT12=10.0)]
        ap = rr._index(_doc(csv_pms))
        bp = rr._index(_doc(db_pms))

        lines = rr._marketing_photo_section(ap, bp, ["a", "b"])
        text = "\n".join(lines)
        self.assertIn("runs lower on the db side", text)

    def test_photo_narrative_direction_helper(self):
        self.assertEqual(rr._direction_word(20, 10), "lower")
        self.assertEqual(rr._direction_word(10, 20), "higher")
        self.assertEqual(rr._direction_word(10, 10.5), "about the same")
        self.assertEqual(rr._direction_word(None, 10), "differently")

    def test_report_end_to_end_includes_photo_section(self):
        csv_doc = _doc([_pm("a", photosScore=10.0), _pm("b", photosScore=20.0)])
        db_doc = _doc([_pm("a", photosScore=40.0), _pm("b", photosScore=50.0)])
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        out = rr.report(csv_path, db_path)

        self.assertIn("### Marketing / photos", out)
        self.assertIn("Photos sub-score", out)


class CountsSection(TmpJsonMixin, unittest.TestCase):
    def test_counts_use_market_summary_and_csv_snapshot_meta(self):
        csv_doc = _doc(
            [_pm("a")],
            market_summary={"msaIndexUrus": 100, "operatorCountTotal": 50, "activeOperatorCount": 20},
        )
        db_doc = _doc(
            [_pm("a"), _pm("b")],
            market_summary={"msaIndexUrus": 150, "operatorCountTotal": 60, "activeOperatorCount": 25},
        )
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        out = rr.report(csv_path, db_path,
                         csv_snapshot_meta={"input_rows": 12935, "uru_coverage_pct": 99.97})

        self.assertIn("12,935", out)
        self.assertIn("99.97", out)
        self.assertIn("100", out)  # csv msaIndexUrus
        self.assertIn("150", out)  # db msaIndexUrus
        # Operators-scored row: 1 -> 2
        self.assertIn("| Operators scored (ranked+dormant, T12 >=30) | 1 | 2 | +1 |", out)


class UruDropInvariant(unittest.TestCase):
    """The reader's own output is 100% uru_id coverage by construction
    (has_uru is one of its own population predicates), so that can never
    fail and isn't a meaningful invariant. What replaces it: how much of the
    would-be population never makes it in for lacking a URU at all."""

    def test_share_at_or_below_one_percent_passes(self):
        label, verdict = rr._uru_drop_invariant({
            "rows_passing_other_predicates": 1000,
            "rows_excluded_only_by_has_uru": 10,
        })
        self.assertEqual(verdict, "PASS")
        self.assertIn("10", label)
        self.assertIn("1.00%", label)

    def test_share_above_one_percent_fails(self):
        label, verdict = rr._uru_drop_invariant({
            "rows_passing_other_predicates": 1000,
            "rows_excluded_only_by_has_uru": 11,
        })
        self.assertEqual(verdict, "FAIL")
        self.assertIn("1.10%", label)

    def test_missing_stats_report_n_a_not_a_fabricated_pass(self):
        label, verdict = rr._uru_drop_invariant({})
        self.assertEqual(verdict, "n/a")
        self.assertIn("n/a", label)


class DbSnapshotInfoPicksMatchingMarket(TmpJsonMixin, unittest.TestCase):
    """Fix round (hardening g): a directory can hold snapshot metas for more
    than one market -- the lexically-last filename has no relationship to
    which one is THIS market's, so _db_snapshot_info must pick by the meta's
    own msa_code, not glob order."""

    def _write_snapshot(self, name, msa_code, row_count, reader_stats=None):
        csv_path = os.path.join(self._tmp.name, name)
        with open(csv_path, "w", encoding="utf-8", newline="") as fh:
            fh.write("uru_id\n1\n2\n")
        meta = {
            "msa_code": msa_code,
            "row_count": row_count,
            "reader_stats": reader_stats or {},
        }
        with open(csv_path + ".meta.json", "w", encoding="utf-8") as fh:
            json.dump(meta, fh)
        return csv_path

    def test_picks_the_meta_matching_msa_code_not_the_lexically_last(self):
        # "zzz" sorts after "aaa" lexically but belongs to a different
        # market -- the pick must go by the meta's own msa_code.
        self._write_snapshot("db_snapshot_zzz_20260101.csv", "99999", row_count=5)
        self._write_snapshot("db_snapshot_aaa_20260101.csv", "14580", row_count=42)
        db_json = self._write("db.json", _doc([_pm("a")]))

        info = rr._db_snapshot_info(db_json, msa_code="14580")

        self.assertEqual(info["row_count"], 42)

    def test_falls_back_to_lexically_last_when_msa_code_not_given(self):
        self._write_snapshot("db_snapshot_aaa_20260101.csv", "14580", row_count=42)
        self._write_snapshot("db_snapshot_zzz_20260101.csv", "99999", row_count=5)
        db_json = self._write("db.json", _doc([_pm("a")]))

        info = rr._db_snapshot_info(db_json)

        self.assertEqual(info["row_count"], 5)


class ReportEndToEndUruInvariant(TmpJsonMixin, unittest.TestCase):
    def test_report_shows_the_drop_share_not_a_bare_100_percent(self):
        csv_doc = _doc([_pm("a")], market_summary={"msaCode": "14580"})
        db_doc = _doc([_pm("a")], market_summary={"msaCode": "14580"})
        csv_path = self._write("csv.json", csv_doc)
        db_path = self._write("db.json", db_doc)

        snapshot_csv = os.path.join(self._tmp.name, "db_snapshot_bozeman_20260908.csv")
        with open(snapshot_csv, "w", encoding="utf-8", newline="") as fh:
            fh.write("uru_id\n1\n2\n")
        meta = {
            "msa_code": "14580",
            "row_count": 2,
            "reader_stats": {
                "rows_passing_other_predicates": 1000,
                "rows_excluded_only_by_has_uru": 5,
            },
        }
        with open(snapshot_csv + ".meta.json", "w", encoding="utf-8") as fh:
            json.dump(meta, fh)

        out = rr.report(csv_path, db_path)

        self.assertNotIn("uru_id coverage 100% (db snapshot)", out)
        self.assertIn("Rows dropped only for a missing URU: 5 (0.50%)", out)
        self.assertIn("| Rows dropped only for a missing URU: 5 (0.50%) | PASS |", out)
        self.assertIn("100% by construction", out)


class CombinedCli(TmpJsonMixin, unittest.TestCase):
    def test_combined_report_concatenates_markets_with_header(self):
        csv1 = self._write("csv1.json", _doc([_pm("a", marketId="market-one")]))
        db1 = self._write("db1.json", _doc([_pm("a", marketId="market-one")]))
        csv2 = self._write("csv2.json", _doc([_pm("x", marketId="market-two")]))
        db2 = self._write("db2.json", _doc([_pm("x", marketId="market-two")]))

        text = rr._combined_report([(csv1, db1), (csv2, db2)], as_of="2026-09-08")

        self.assertIn("# Dwellsy DB source cutover: restatement report", text)
        self.assertIn("--as-of 2026-09-08", text)
        self.assertIn("## market-one", text)
        self.assertIn("## market-two", text)


if __name__ == "__main__":
    unittest.main()
