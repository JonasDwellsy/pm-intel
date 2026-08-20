import unittest
from merge import (
    link_by_parent_id,
    load_curated_canon_slugs,
    load_website_verdicts,
    propose_canonicals,
)


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


def _prop_pm(market, slug, name, company_id=None, parent_id=None):
    return {"marketId": market, "slug": slug, "name": name,
            "companyId": company_id, "parentCompanyId": parent_id,
            "canonicalOperatorId": slug, "canonicalOperatorName": name}


class ProposalWebsiteEvidence(unittest.TestCase):
    """Canonical proposals match on normalized NAME ALONE, so the reviewer
    needs disambiguating evidence in the proposal itself. The Peak Property
    Management case is the reason: three unrelated local operators in CO, VA
    and MT were proposed as one cross-market entity, and the fastest tell was
    that two of them had visibly different websites already stored in the repo.
    """

    def _merged(self):
        # Same shape as the real Peak case: two markets with a stored website,
        # one brand-new market that has never been scraped.
        return {
            "pms": [
                _prop_pm("fort-collins-co", "peak-fc", "Peak Property Management", "191153"),
                _prop_pm("richmond-va", "peak-rva", "Peak Property Management", "907249", "39109"),
                _prop_pm("bozeman-mt", "peak-boz", "Peak Property Management", "463937"),
            ],
            "canonicalOperators": {},
        }

    def test_members_carry_website_and_distinct_websites_is_summarised(self):
        out = propose_canonicals(self._merged(), ["bozeman-mt"])
        self.assertEqual(len(out["new_pairs"]), 1)
        pair = out["new_pairs"][0]
        sites = {m["slug"]: m["website"] for m in pair["members"]}
        # Real verdict file: FC and RVA have URLs, Bozeman does not.
        self.assertTrue(sites["peak-fc"], "Fort Collins should carry a stored URL")
        self.assertTrue(sites["peak-rva"], "Richmond should carry a stored URL")
        self.assertIsNone(sites["peak-boz"])
        # Two distinct domains is the signal that makes this a reject.
        self.assertGreaterEqual(len(pair["distinct_websites"]), 2)

    def test_unscraped_is_labelled_not_silently_blank(self):
        # A missing URL means "never scraped", not "has no website". Leaving the
        # key absent would read as the latter.
        out = propose_canonicals(self._merged(), ["bozeman-mt"])
        boz = next(m for m in out["new_pairs"][0]["members"] if m["slug"] == "peak-boz")
        self.assertEqual(boz["websiteEvidence"], "not scraped")

    def test_parent_ids_are_surfaced_for_context(self):
        out = propose_canonicals(self._merged(), ["bozeman-mt"])
        members = {m["slug"]: m for m in out["new_pairs"][0]["members"]}
        self.assertEqual(members["peak-rva"]["parentCompanyId"], "39109")
        # Absent rather than null for the two with no parent — the instructions
        # warn that a MISSING parent id proves nothing.
        self.assertNotIn("parentCompanyId", members["peak-fc"])

    def test_instructions_warn_against_the_parent_id_inference(self):
        out = propose_canonicals(self._merged(), ["bozeman-mt"])
        text = out["_instructions"]
        self.assertIn("distinct_websites", text)
        self.assertIn("not scraped", text)
        self.assertIn("parentCompanyId", text)
        self.assertIn("REJECT", text)


class LoadWebsiteVerdicts(unittest.TestCase):
    def test_reads_the_real_verdict_file_keyed_by_company_id(self):
        v = load_website_verdicts()
        self.assertGreater(len(v), 1000)
        # Fort Collins Peak — the record that settled the real decision.
        self.assertIn("191153", v)
        self.assertTrue(v["191153"].get("url"))

    def test_missing_file_is_not_fatal(self):
        # The proposal is still useful without evidence; it just costs more.
        self.assertEqual(load_website_verdicts("/nonexistent/path.json"), {})


if __name__ == "__main__":
    unittest.main()
