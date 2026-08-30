import unittest

from marketing import (
    compute_marketing,
    count_content_categories,
    count_descriptive_categories,
    count_distinct_words,
    count_policy_categories,
)


def _L(amenities_n, desc_len, distinct_words, content_cats, photos_n,
       descriptive_cats=None, policy_cats=None):
    """Build one marketing_listings_t12 listing dict.

    v0.11 split content_cats into disjoint descriptive (0-4) and policy (0-3)
    counts. Legacy callers pass only content_cats, so default by apportioning
    it descriptive-first — which mirrors the real data, where descriptive
    categories are far more common (amenities 78.0%, location 72.2%) than
    policy ones (pet 36.4%, fees 35.0%, lease 34.6%)."""
    if descriptive_cats is None:
        descriptive_cats = min(4, content_cats)
    if policy_cats is None:
        policy_cats = max(0, min(3, content_cats - 4))
    return {"amenities_n": amenities_n, "desc_len": desc_len,
            "distinct_words": distinct_words, "content_cats": content_cats,
            "descriptive_cats": descriptive_cats, "policy_cats": policy_cats,
            "photos_n": photos_n}


def _d(listings):
    """Wrap listing dicts the way compute_marketing expects."""
    return {"marketing_listings_t12": listings}


class MarketingComposite(unittest.TestCase):
    """Marketing composite, v0.11 — rules are a first-class component.

        composite = 0.30*completeness + 0.20*photos + 0.20*description
                    + 0.15*amenities + 0.15*policies
          amenities:   min(100, 100 * mean_amenities / 18)
          description: 0.5*length + 0.5*richness (over NON-BLANK listings)
            length:   min(100, 100 * mean_distinct_words / 195)
            richness: 100 * min(1, mean_DESCRIPTIVE_categories / 3)
          policies:    100 * min(1, mean_POLICY_categories / 2)
          photos:      min(100, 100 * median_photos / 30)
          completeness: % of listings that have desc AND photos AND amenities

    Policies (pet, fees, lease) used to be three of seven interchangeable
    richness categories, which let an operator max richness on amenities and
    location while telling a renter nothing about the rules. They are the least
    stated part of a listing in the real data, which is exactly why they need
    their own weight rather than an averaged one.
    """

    def test_fully_rich_listing_scores_100(self):
        # Saturated on every component: 4 descriptive + 3 policy categories.
        m = compute_marketing(_d([_L(18, 1200, 195, 7, 30, descriptive_cats=4, policy_cats=3)]))
        self.assertEqual(m["policiesScore"], 100.0)
        self.assertEqual(m["amenitiesScore"], 100.0)
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["photosScore"], 100.0)
        self.assertEqual(m["completenessScore"], 100.0)
        self.assertEqual(m["compositeScore"], 100.0)

    def test_description_components_are_capped_at_saturation(self):
        # 390 distinct words = 2x the 195 saturation -> length capped at 100;
        # 7 categories > the 6 cap -> richness capped at 100. desc = 100.
        m = compute_marketing(_d([_L(40, 3000, 390, 7, 60, descriptive_cats=4, policy_cats=3)]))
        self.assertEqual(m["photosScore"], 100.0)
        self.assertEqual(m["amenitiesScore"], 100.0)
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["compositeScore"], 100.0)

    def test_complete_but_thin_operator_scores_mid_low(self):
        # Everything present but thin, and NO rules stated — the common shape.
        # amen 3/18=16.7; length 78/195=40; richness 3/3=100 -> desc=70;
        # policies 0; photos 6/30=20.
        # 0.30*100 + 0.20*20 + 0.20*70 + 0.15*16.667 + 0.15*0 = 50.5
        m = compute_marketing(_d([_L(3, 300, 78, 3, 6, descriptive_cats=3, policy_cats=0)]))
        self.assertEqual(m["completenessScore"], 100.0)
        self.assertEqual(m["descScore"], 70.0)
        self.assertEqual(m["photosScore"], 20.0)
        self.assertEqual(m["policiesScore"], 0.0)
        self.assertEqual(m["compositeScore"], 50.5)

    def test_stating_the_rules_is_what_separates_two_otherwise_equal_operators(self):
        # The whole point of the v0.11 split. Identical listings except one
        # states pet/fees/lease and the other does not.
        silent = compute_marketing(_d([_L(18, 1200, 195, 4, 30, descriptive_cats=4, policy_cats=0)]))
        stated = compute_marketing(_d([_L(18, 1200, 195, 7, 30, descriptive_cats=4, policy_cats=2)]))
        self.assertEqual(silent["policiesScore"], 0.0)
        self.assertEqual(stated["policiesScore"], 100.0)
        # Exactly the policies weight separates them; nothing else moved.
        self.assertAlmostEqual(stated["compositeScore"] - silent["compositeScore"], 15.0, places=1)
        self.assertEqual(silent["descScore"], stated["descScore"])

    def test_policies_cannot_be_substituted_by_descriptive_richness(self):
        # Pre-v0.11 an operator could reach full richness on amenities and
        # location alone. Now descriptive saturation leaves policies at zero.
        m = compute_marketing(_d([_L(18, 1200, 195, 4, 30, descriptive_cats=4, policy_cats=0)]))
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["policiesScore"], 0.0)

    def test_blank_descriptions_excluded_when_sample_reliable(self):
        # 5 rich listings (meets the >=5 non-blank reliability bar) + 1 blank.
        # description means are taken over the 5 NON-BLANK listings, so descScore
        # stays 100 (words 195, cats 6) -- the blank is NOT double-penalized
        # here (completeness already docks it: 5/6 have all three).
        m = compute_marketing(_d([_L(18, 1200, 195, 7, 30, descriptive_cats=4, policy_cats=3)] * 5
                                  + [_L(18, 0, 0, 0, 30, descriptive_cats=0, policy_cats=0)]))
        self.assertAlmostEqual(m["completenessScore"], 83.3, places=1)
        self.assertEqual(m["descWords"], 195)
        self.assertEqual(m["descContentCats"], 7.0)
        self.assertEqual(m["descScore"], 100.0)
        self.assertEqual(m["policiesScore"], 100.0)

    def test_small_nonblank_sample_counts_blanks(self):
        # Only 1 rich description among 5 listings (< the 5-non-blank bar) ->
        # blanks count (blank-inclusive means), so a tiny rich sample cannot max
        # the sub-score. words_mean = 390/5 = 78 -> length 40; descriptive
        # 4/5 = 0.8 -> richness 26.67; desc = 0.5*40 + 0.5*26.67 = 33.3.
        # policies 3/5 = 0.6 -> 30.0, likewise diluted by the blanks.
        m = compute_marketing(_d([_L(18, 3000, 390, 7, 30, descriptive_cats=4, policy_cats=3)]
                                  + [_L(18, 0, 0, 0, 30, descriptive_cats=0, policy_cats=0)] * 4))
        self.assertEqual(m["descWords"], 78)       # blank-inclusive mean
        self.assertEqual(m["descScore"], 33.3)
        self.assertEqual(m["policiesScore"], 30.0)

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
        self.assertEqual(m["policiesScore"], 0.0)


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

    def test_descriptive_and_policy_categories_are_disjoint(self):
        # Nothing may be double-counted: the two counts must sum to the total.
        desc = ("Renovated kitchen with a dishwasher. Walk to downtown shops "
                "and the park. Garage parking available. Pets welcome. "
                "Security deposit required. Month-to-month lease available.")
        self.assertEqual(count_descriptive_categories(desc), 4)
        self.assertEqual(count_policy_categories(desc), 3)
        self.assertEqual(
            count_descriptive_categories(desc) + count_policy_categories(desc),
            count_content_categories(desc),
        )

    def test_policy_categories_alone(self):
        self.assertEqual(count_policy_categories("Pets welcome. $500 deposit."), 2)
        self.assertEqual(count_descriptive_categories("Pets welcome. $500 deposit."), 0)

    def test_policy_categories_blank_and_none(self):
        self.assertEqual(count_policy_categories(""), 0)
        self.assertEqual(count_policy_categories(None), 0)
        self.assertEqual(count_descriptive_categories(None), 0)

    def test_content_categories_none_present(self):
        self.assertEqual(count_content_categories("Nice unit."), 0)
        self.assertEqual(count_content_categories(""), 0)
        self.assertEqual(count_content_categories(None), 0)


if __name__ == "__main__":
    unittest.main()
