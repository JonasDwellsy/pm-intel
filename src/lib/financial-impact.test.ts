import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { calculateFinancialImpact, financialImpactPriority, FINANCIAL_IMPACT_DISCLOSURE } from "@/lib/portfolio-iq/financial";

function impact(overrides: Partial<Parameters<typeof calculateFinancialImpact>[0]> = {}) {
  return calculateFinancialImpact({ askingRent: 1_000, compAskingRent: 1_100, observationCount: 12, compCount: 4, compLocked: true, inventoryUnits: 80, affectedUnits: 20, realizationPct: 0.5, assumptionSource: "owner", ...overrides });
}

test("financial impact calculates transparent gross and realization-adjusted exposure", () => {
  const result = impact();
  assert.equal(result.direction, "opportunity");
  assert.equal(result.monthlyGapPerUnit, 100);
  assert.equal(result.annualGrossExposure, 24_000);
  assert.equal(result.annualRealizationAdjusted, 12_000);
  assert.equal(result.confidence, "high");
});

test("asking above approved comps is pricing exposure, not guaranteed loss", () => {
  const result = impact({ askingRent: 1_250, compAskingRent: 1_100 });
  assert.equal(result.direction, "pricing_exposure");
  assert.equal(result.monthlyGapPerUnit, 150);
  assert.equal(result.annualRealizationAdjusted, 18_000);
});

test("missing affected units preserves the per-unit gap but withholds dollars", () => {
  const result = impact({ affectedUnits: null, assumptionSource: "missing" });
  assert.equal(result.status, "assumptions_needed");
  assert.equal(result.monthlyGapPerUnit, 100);
  assert.equal(result.annualGrossExposure, null);
  assert.equal(result.annualRealizationAdjusted, null);
});

test("unlocked comps and missing subject observations fail closed", () => {
  assert.equal(impact({ compLocked: false }).status, "comps_needed");
  assert.equal(impact({ observationCount: 0, askingRent: null }).status, "subject_evidence_needed");
});

test("ready estimates rank ahead of incomplete estimates", () => {
  assert.ok(financialImpactPriority(impact()) > financialImpactPriority(impact({ affectedUnits: null })));
});

test("disclosure rejects occupancy, lease, NOI, and guaranteed revenue claims", () => {
  assert.match(FINANCIAL_IMPACT_DISCLOSURE, /does not represent occupancy, signed leases, concessions, effective rent, NOI, or guaranteed revenue/);
});

test("financial assumption migration is additive and isolated from Operator IQ", async () => {
  const sql = await readFile("prisma/migrations/20260811090000_portfolio_iq_financial_prioritization/migration.sql", "utf8");
  assert.match(sql, /CREATE TABLE "PortfolioIqFinancialAssumption"/);
  assert.match(sql, /realizationPct/);
  assert.doesNotMatch(sql, /ALTER TABLE "PM"|ALTER TABLE "OperatorSnapshot"|DROP TABLE|DROP COLUMN/);
});

test("owner assumption action validates tenant access and affected-unit bounds", async () => {
  const source = await readFile("src/app/portfolio-iq/financial-actions.ts", "utf8");
  assert.match(source, /affectedUnits > inventoryUnits/);
  assert.match(source, /isAdminUser/);
  assert.match(source, /portfolio\.organizationId !== organizationId/);
  assert.match(source, /assetId_bedrooms/);
});
