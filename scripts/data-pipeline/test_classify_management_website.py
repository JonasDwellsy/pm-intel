import unittest
from classify_management_website import classify_text


class ClassifyText(unittest.TestCase):
    def test_strong_single_tell_is_third_party_high(self):
        for phrase in ["free rental analysis", "owner portal", "list your property"]:
            v, c, _ = classify_text(f"Welcome to us. {phrase} today.")
            self.assertEqual((v, c), ("third_party", "high"), phrase)

    def test_two_weak_tells_high(self):
        # "our services", "tenant placement", "landlord" -> >=2 weak
        v, c, _ = classify_text("Our services include tenant placement for every landlord.")
        self.assertEqual((v, c), ("third_party", "high"))

    def test_one_weak_tell_medium(self):
        v, c, _ = classify_text("We manage buildings across the city.")  # only "we manage"
        self.assertEqual((v, c), ("third_party", "medium"))

    def test_owner_framing_only_is_owner_operator_medium(self):
        v, c, _ = classify_text("Explore our communities and our portfolio of living.")
        self.assertEqual((v, c), ("owner_operator", "medium"))

    def test_neutral_is_inconclusive(self):
        v, c, m = classify_text("Luxury apartments. Now leasing. Call today.")
        self.assertEqual((v, c, m), ("inconclusive", None, []))

    def test_strong_beats_owner_framing(self):
        v, _, _ = classify_text("Our communities are great. Owner portal login here.")
        self.assertEqual(v, "third_party")

    def test_resident_portal_is_oo_only_without_owner_portal(self):
        v, _, _ = classify_text("Resident portal login. Pay rent online.")
        self.assertEqual(v, "owner_operator")


if __name__ == "__main__":
    unittest.main()
