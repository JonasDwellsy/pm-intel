import unittest
from merge import link_by_parent_id, load_curated_canon_slugs


def _pm(market, slug, name, canon_id, canon_name=None, pid=None, pname=None):
    return {"marketId": market, "slug": slug, "name": name,
            "canonicalOperatorId": canon_id, "canonicalOperatorName": canon_name or name,
            "parentCompanyId": pid, "parentCompanyName": pname}


class LinkByParentIdCuratedGuard(unittest.TestCase):
    def test_curated_canonical_is_not_overridden_by_parent_id(self):
        # PURE Arizona: the auto-merge gave it a market-specific parent id/name,
        # but its curated cross-market canonical is "pure-property-management".
        # The ID linker must NOT yank it to "pure-property-management-of-arizona"
        # (which would fragment the curated group).
        pms = [
            _pm("phoenix-az", "pure-az", "Pure Property Management of Arizona",
                "pure-property-management", "Pure Property Management",
                pid="503198", pname="PURE Property Management of Arizona"),
            _pm("birmingham-al", "pure-al", "PURE Property Management of Alabama",
                "pure-property-management", "Pure Property Management"),  # no parent id
        ]
        link_by_parent_id(pms, curated_canon_slugs={"pure-property-management"})
        self.assertEqual(pms[0]["canonicalOperatorId"], "pure-property-management")
        self.assertEqual(pms[1]["canonicalOperatorId"], "pure-property-management")

    def test_uncurated_operator_still_auto_links_by_parent(self):
        # An operator with NO curated canonical still gets auto-linked by parent id.
        pms = [
            _pm("x", "acme-x", "Acme", "acme-x", pid="999", pname="Acme Holdings"),
            _pm("y", "acme-y", "Acme", "acme-y", pid="999", pname="Acme Holdings"),
        ]
        link_by_parent_id(pms, curated_canon_slugs={"pure-property-management"})
        self.assertEqual(pms[0]["canonicalOperatorId"], "acme-holdings")
        self.assertEqual(pms[1]["canonicalOperatorId"], "acme-holdings")

    def test_default_no_curated_set_preserves_prior_behavior(self):
        # Backward-compat: with no curated set the linker overrides as before.
        pms = [_pm("phoenix-az", "pure-az", "Pure Property Management of Arizona",
                   "pure-property-management", pid="503198",
                   pname="PURE Property Management of Arizona")]
        link_by_parent_id(pms)
        self.assertEqual(pms[0]["canonicalOperatorId"], "pure-property-management-of-arizona")


class LoadCuratedCanonSlugs(unittest.TestCase):
    def test_loads_real_decision_slugs(self):
        slugs = load_curated_canon_slugs()
        self.assertIn("pure-property-management", slugs)
        self.assertIn("homeriver-group", slugs)
        self.assertGreater(len(slugs), 100)


if __name__ == "__main__":
    unittest.main()
