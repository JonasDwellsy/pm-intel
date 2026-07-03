import test from "node:test";
import { strict as assert } from "node:assert";
import { buildScorecardView } from "./view-model";
import type { ScorecardData } from "@/lib/types";

function scFixture(over: any = {}): ScorecardData {
  return {
    pm: { slug: "doorby-chattanooga-tn", name: "Doorby", quadrant7Cell: "SFR Independent",
          companyId: "191930", website: "https://doorby.com", ...(over.pm ?? {}) },
    market: { id: "chattanooga-tn", name: "Chattanooga", state: "TN", fullName: "Chattanooga MSA" },
    rank: { percentiles: { dom: 66, tenancy: 82, rentPerformance: 48, marketing: 70, communityVisibility: null },
            percentilesMulti: { composite: { primary: 68, msa: 62 } }, compositeCohortUsedForStar: "primary" },
    performance: { domStar: "silver" }, tenancy: { star: "gold" }, rentPerformance: { star: null },
    marketing: { star: "silver" }, communityVisibility: { star: null },
    ...over,
  } as unknown as ScorecardData;
}

test("header carries name, star counts, and both links (companyId + website)", () => {
  const v = buildScorecardView({ scorecard: scFixture(), pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 });
  assert.equal(v.header.name, "Doorby");
  assert.equal(v.header.dwellsyCompanyUrl, "https://dwellsy.com/company/191930");
  assert.equal(v.header.website, "https://doorby.com");
  assert.equal(v.header.singleMarket, true);
  assert.equal(typeof v.header.goldCount, "number");
});

test("header dwellsyCompanyUrl is null when companyId missing", () => {
  const v = buildScorecardView({ scorecard: scFixture({ pm: { companyId: null, name: "X", slug: "x", quadrant7Cell: "SFR Independent" } }), pool: [], trajectory: { points: [] }, marketConcessionMedian: null });
  assert.equal(v.header.dwellsyCompanyUrl, null);
});

test("readout has the four areas with the Operating Performance label", () => {
  const v = buildScorecardView({ scorecard: scFixture(), pool: [], trajectory: { points: [] }, marketConcessionMedian: 0.01 });
  const areas = v.readout.map((r) => r.area);
  assert.deepEqual(areas, ["Scale & Fit", "Operating Performance", "Momentum", "Watch Items"]);
  const op = v.readout.find((r) => r.area === "Operating Performance");
  assert.equal(op!.label, "good"); // composite primary 68 -> good
});
