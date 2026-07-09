import unittest

from marketing import compute_marketing


def _d(listings):
    """Wrap listing dicts the way compute_marketing expects."""
    return {"marketing_listings_t12": listings}


class MarketingComposite(unittest.TestCase):
    """Recalibrated marketing composite (Sharp / p90-anchored profile):

        composite = 0.35*completeness + 0.20*amenities + 0.20*description
                    + 0.25*photos
          amenities:   min(100, 100 * mean_amenities / 18)
          description: min(100, 100 * mean_desc_chars / 1200)
          photos:      min(100, 100 * median_photos   / 30)   # NEW sub-score
          completeness: % of listings that have desc AND photos AND amenities
    """

    def test_fully_rich_listing_scores_100(self):
        m = compute_marketing(_d([{"amenities_n": 18, "desc_len": 1200, "photos_n": 30}]))
        self.assertEqual(m["amenitiesScore"], 100.0)
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["photosScore"], 100.0)
        self.assertEqual(m["completenessScore"], 100.0)
        self.assertEqual(m["compositeScore"], 100.0)

    def test_photos_are_scored_and_capped_at_saturation(self):
        # 60 photos is 2x the saturation point of 30 -> capped at 100, not 200.
        m = compute_marketing(_d([{"amenities_n": 40, "desc_len": 3000, "photos_n": 60}]))
        self.assertEqual(m["photosScore"], 100.0)
        self.assertEqual(m["amenitiesScore"], 100.0)
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["compositeScore"], 100.0)

    def test_complete_but_thin_operator_scores_mid_low(self):
        # All three elements present (completeness 100) but each is thin:
        # amen 3/18=16.7, desc 300/1200=25, photos 6/30=20.
        # 0.35*100 + 0.20*16.667 + 0.20*25 + 0.25*20 = 48.3
        m = compute_marketing(_d([{"amenities_n": 3, "desc_len": 300, "photos_n": 6}]))
        self.assertEqual(m["completenessScore"], 100.0)
        self.assertEqual(m["photosScore"], 20.0)
        self.assertEqual(m["compositeScore"], 48.3)

    def test_incomplete_listing_drops_completeness_and_photo_depth(self):
        # One full listing + one with no photos.
        # completeness: 1/2 = 50. photos median = median(30, 0) = 15 -> 50.
        # amen mean 18 -> 100. desc mean 1200 -> 100.
        # 0.35*50 + 0.20*100 + 0.20*100 + 0.25*50 = 70.0
        m = compute_marketing(_d([
            {"amenities_n": 18, "desc_len": 1200, "photos_n": 30},
            {"amenities_n": 18, "desc_len": 1200, "photos_n": 0},
        ]))
        self.assertEqual(m["completenessScore"], 50.0)
        self.assertEqual(m["photosScore"], 50.0)
        self.assertEqual(m["compositeScore"], 70.0)

    def test_empty_listings_returns_zeroed_dict_with_photo_score(self):
        m = compute_marketing(_d([]))
        self.assertEqual(m["compositeScore"], 0.0)
        self.assertEqual(m["photosScore"], 0.0)


if __name__ == "__main__":
    unittest.main()
