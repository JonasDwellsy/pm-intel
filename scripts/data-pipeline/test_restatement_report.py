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
        compositeScore=60.0, marketingStar=None, quadrant7Cell="SFR Independent"):
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
        "marketing": {"photosScore": photosScore, "compositeScore": compositeScore, "star": marketingStar},
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
        # DOM star deltas: unchanged, up1, up2+ (None->gold), down1, down2+ (gold->None)
        csv_pms = [
            _pm("unchanged", domStar="gold"),
            _pm("up1", domStar="silver"),
            _pm("up2plus", domStar=None),
            _pm("down1", domStar="silver"),
            _pm("down2plus", domStar="gold"),
        ]
        db_pms = [
            _pm("unchanged", domStar="gold"),
            _pm("up1", domStar="gold"),
            _pm("up2plus", domStar="gold"),
            _pm("down1", domStar="bronze"),
            _pm("down2plus", domStar=None),
        ]
        csv_path = self._write("csv.json", _doc(csv_pms))
        db_path = self._write("db.json", _doc(db_pms))

        both = sorted(p["slug"] for p in csv_pms)
        ap = rr._index(_doc(csv_pms))
        bp = rr._index(_doc(db_pms))

        lines = rr._metric_movements_section(both, ap, bp)
        text = "\n".join(lines)
        # DOM row: n=5, unchanged=1, up1=1, up2+=1, down1=1, down2+=1
        dom_row = next(l for l in lines if l.startswith("| DOM"))
        cells = [c.strip() for c in dom_row.strip("|").split("|")]
        # cells: label, n, median|delta|, unchanged, up1, up2+, down1, down2+
        self.assertEqual(cells[1], "5")
        self.assertEqual(cells[3], "1")  # unchanged
        self.assertEqual(cells[4], "1")  # up1
        self.assertEqual(cells[5], "1")  # up2+
        self.assertEqual(cells[6], "1")  # down1
        self.assertEqual(cells[7], "1")  # down2+


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
