import unittest

from marketing import (
    compute_marketing,
    count_content_categories,
    count_distinct_words,
)


def _L(amenities_n, desc_len, distinct_words, content_cats, photos_n):
    """Build one marketing_listings_t12 listing dict."""
    return {"amenities_n": amenities_n, "desc_len": desc_len,
            "distinct_words": distinct_words, "content_cats": content_cats,
            "photos_n": photos_n}


def _d(listings):
    """Wrap listing dicts the way compute_marketing expects."""
    return {"marketing_listings_t12": listings}


class MarketingComposite(unittest.TestCase):
    """Recalibrated marketing composite (Sharp / p90-anchored profile):

        composite = 0.35*completeness + 0.20*amenities + 0.20*description
                    + 0.25*photos
          amenities:   min(100, 100 * mean_amenities / 18)
          description: 0.5*length + 0.5*richness (over NON-BLANK listings)
            length:   min(100, 100 * mean_distinct_words / 195)
            richness: 100 * min(1, mean_content_categories / 6)
          photos:      min(100, 100 * median_photos   / 30)
          completeness: % of listings that have desc AND photos AND amenities
    """

    def test_fully_rich_listing_scores_100(self):
        m = compute_marketing(_d([_L(18, 1200, 195, 6, 30)]))
        self.assertEqual(m["amenitiesScore"], 100.0)
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["photosScore"], 100.0)
        self.assertEqual(m["completenessScore"], 100.0)
        self.assertEqual(m["compositeScore"], 100.0)

    def test_description_components_are_capped_at_saturation(self):
        # 390 distinct words = 2x the 195 saturation -> length capped at 100;
        # 7 categories > the 6 cap -> richness capped at 100. desc = 100.
        m = compute_marketing(_d([_L(40, 3000, 390, 7, 60)]))
        self.assertEqual(m["photosScore"], 100.0)
        self.assertEqual(m["amenitiesScore"], 100.0)
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["compositeScore"], 100.0)

    def test_complete_but_thin_operator_scores_mid_low(self):
        # All three elements present (completeness 100) but each is thin:
        # amen 3/18=16.7; desc = 0.5*(78/195*100) + 0.5*(3/6*100) = 0.5*40+0.5*50 = 45;
        # photos 6/30=20.
        # 0.35*100 + 0.20*16.667 + 0.20*45 + 0.25*20 = 52.3
        m = compute_marketing(_d([_L(3, 300, 78, 3, 6)]))
        self.assertEqual(m["completenessScore"], 100.0)
        self.assertEqual(m["descScore"], 45.0)
        self.assertEqual(m["photosScore"], 20.0)
        self.assertEqual(m["compositeScore"], 52.3)

    def test_blank_descriptions_excluded_when_sample_reliable(self):
        # 5 rich listings (meets the >=5 non-blank reliability bar) + 1 blank.
        # description means are taken over the 5 NON-BLANK listings, so descScore
        # stays 100 (words 195, cats 6) -- the blank is NOT double-penalized
        # here (completeness already docks it: 5/6 have all three).
        m = compute_marketing(_d([_L(18, 1200, 195, 6, 30)] * 5 + [_L(18, 0, 0, 0, 30)]))
        self.assertAlmostEqual(m["completenessScore"], 83.3, places=1)
        self.assertEqual(m["descWords"], 195)
        self.assertEqual(m["descContentCats"], 6.0)
        self.assertEqual(m["descScore"], 100.0)

    def test_small_nonblank_sample_counts_blanks(self):
        # Only 1 rich description among 5 listings (< the 5-non-blank bar) ->
        # blanks count (blank-inclusive means), so a tiny rich sample cannot max
        # the sub-score. words_mean = 390/5 = 78 -> length 40; cats 7/5 = 1.4 ->
        # richness 23.33; desc = 0.5*40 + 0.5*23.33 = 31.7.
        m = compute_marketing(_d([_L(18, 3000, 390, 7, 30)] + [_L(18, 0, 0, 0, 30)] * 4))
        self.assertEqual(m["descWords"], 78)       # blank-inclusive mean
        self.assertEqual(m["descContentCats"], 1.4)
        self.assertEqual(m["descScore"], 31.7)

    def test_all_blank_descriptions_score_zero(self):
        # No non-blank descriptions -> blank-inclusive means are 0 -> desc 0.
        m = compute_marketing(_d([_L(5, 0, 0, 0, 10)]))
        self.assertEqual(m["descWords"], 0)
        self.assertEqual(m["descContentCats"], 0.0)
        self.assertEqual(m["descScore"], 0.0)

    def test_empty_listings_returns_zeroed_dict_with_new_keys(self):
        m = compute_marketing(_d([]))
        self.assertEqual(m["compositeScore"], 0.0)
        self.assertEqual(m["photosScore"], 0.0)
        self.assertEqual(m["descWords"], 0)
        self.assertEqual(m["descContentCats"], 0.0)
        self.assertEqual(m["descScore"], 0.0)


class DescriptionHelpers(unittest.TestCase):
    def test_distinct_words_dedupes_and_lowercases(self):
        # the, cozy, home -> 3 distinct despite repeats / case / punctuation.
        self.assertEqual(count_distinct_words("The cozy home, the COZY home!"), 3)

    def test_distinct_words_blank_and_none(self):
        self.assertEqual(count_distinct_words(""), 0)
        self.assertEqual(count_distinct_words(None), 0)

    def test_content_categories_counts_distinct_categories(self):
        desc = ("Renovated kitchen with a dishwasher. Walk to downtown shops "
                "and the park. Garage parking available. Pets welcome. "
                "Security deposit required. Month-to-month lease available.")
        # amenities, location, transit, parking, pet, fees, lease -> all 7.
        self.assertEqual(count_content_categories(desc), 7)

    def test_content_categories_word_boundary_does_not_overcount(self):
        # "parking" must NOT trip the transit "park" marker; only the parking
        # category should fire here.
        self.assertEqual(count_content_categories("Covered parking included."), 1)

    def test_content_categories_none_present(self):
        self.assertEqual(count_content_categories("Nice unit."), 0)
        self.assertEqual(count_content_categories(""), 0)
        self.assertEqual(count_content_categories(None), 0)


if __name__ == "__main__":
    unittest.main()
