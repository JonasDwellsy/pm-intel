// Regression guard for the seed normalizer. buildScorecard() in prisma/seed.ts
// field-picks every part of the stored scorecardData blob, so any pipeline-
// added field it isn't updated to copy is SILENTLY DROPPED. That exact gap left
// the survival-based tenancy fields out of the DB for weeks, so every tenant-
// retention card rendered blank ("—") in production despite the pipeline having
// computed real values. These tests run the real buildScorecard on a
// pipeline-shaped operator and assert the fields the scorecard view-model reads
// survive the normalization.
//
// Importing prisma/seed.ts is safe: its main() is guarded to run only on direct
// execution (`tsx prisma/seed.ts`), so importing it here never triggers a seed.
import test from "node:test";
import { strict as assert } from "node:assert";
import { buildScorecard } from "../../../prisma/seed";

// Minimal market stub — buildScorecard reads these market-level fields; none are
// under test here (we're guarding pm-derived scorecardData fields).
const market = {
  id: "test-market",
  city: "Testville",
  state: "TS",
  fullName: "Testville MSA",
  medianDomT12: 30,
  medianDomLifetime: 32,
  quadrantSummary: {},
  mapCenter: null,
  mapBounds: null,
  msaBackdropPoints: [],
} as never;

// A pipeline-shaped PM carrying the survival-based tenancy fields (+ a couple of
// other sections) exactly as the committed scorecard_data.json does.
function fixturePm(): Record<string, unknown> {
  return {
    slug: "acme-testville-ts",
    name: "Acme",
    marketId: "test-market",
    quadrant: "Scattered / Independent",
    quadrant7Cell: "SFR Independent",
    companyId: "12345",
    tenancy: {
      totalUnits: 100,
      multiEpisodeUnits: 40,
      multiEpisodePct: 40,
      tenancyPercentile: 60,
      retention18Pct: 75.3,
      retentionCurve: { m12: 83.9, m18: 75.3, m24: 63.6 },
      kmMedianMonths: 31,
      atRisk18: 208,
      turnoverEvents: 144,
      tenancyQualified: true,
      tenancySuppressed: false,
      tenancySuppressedReason: null,
      star: "none",
    },
    performance: { domT12: 23, domStar: "silver" },
    marketing: { compositeScore: 73, star: "silver" },
    rank: { percentiles: { tenancy: 60, dom: 55 } },
    propertyDetail: {
      properties: [
        {
          kind: "community",
          label: "The Oaks",
          submarket: null,
          units: 120,
          homes: null,
          nListings: 18,
          medianDomT12: 22,
          medianRentT12: 1450,
          rentYoY: 0.04,
          concessionRate: 0.1,
          listingQuality: 78,
        },
      ],
      comps: {
        medianDomT12: 29,
        medianRentT12: 1510,
        rentYoY: 0.021,
        concessionRate: 0.18,
      },
    },
  };
}

test("REGRESSION: buildScorecard persists survival-based tenancy fields into scorecardData", () => {
  // These were silently dropped by the seed normalizer, blanking every tenant-
  // retention card in production. Guard against recurrence.
  const sc = buildScorecard(fixturePm() as never, market);
  assert.equal(sc.tenancy.retention18Pct, 75.3);
  assert.deepEqual(sc.tenancy.retentionCurve, { m12: 83.9, m18: 75.3, m24: 63.6 });
  assert.equal(sc.tenancy.tenancySuppressed, false);
  assert.equal(sc.tenancy.tenancyQualified, true);
});

test("REGRESSION: buildScorecard persists propertyDetail into scorecardData", () => {
  // propertyDetail (Phase 1 property-level detail) hit the exact silent-drop
  // trap this file guards against: the pipeline populated it on every operator
  // (#260 reseed) but the seed normalizer field-picked it away, so the
  // Properties section never rendered in production. Guard against recurrence.
  const sc = buildScorecard(fixturePm() as never, market);
  assert.ok(sc.propertyDetail, "propertyDetail must survive the seed normalizer");
  assert.equal(sc.propertyDetail?.properties.length, 1);
  assert.equal(sc.propertyDetail?.properties[0].label, "The Oaks");
  assert.equal(sc.propertyDetail?.comps.medianDomT12, 29);
});

test("buildScorecard carries the cross-section fields the scorecard view-model reads", () => {
  const sc = buildScorecard(fixturePm() as never, market);
  assert.equal(sc.performance.domT12, 23); // Lease-up card
  assert.equal(sc.marketing.compositeScore, 73); // Marketing card
  assert.equal(sc.tenancy.retention18Pct, 75.3); // Tenant retention card
  assert.equal(sc.pm.companyId, "12345"); // header Dwellsy company link
});

test("buildScorecard preserves a suppressed operator's caveat, not a fabricated value", () => {
  const pm = fixturePm();
  pm.tenancy = {
    ...(pm.tenancy as Record<string, unknown>),
    retention18Pct: null,
    tenancyQualified: false,
    tenancySuppressed: true,
    tenancySuppressedReason: "Too early to assess renewal.",
  };
  const sc = buildScorecard(pm as never, market);
  assert.equal(sc.tenancy.retention18Pct, null);
  assert.equal(sc.tenancy.tenancySuppressed, true);
  assert.equal(sc.tenancy.tenancySuppressedReason, "Too early to assess renewal.");
});
