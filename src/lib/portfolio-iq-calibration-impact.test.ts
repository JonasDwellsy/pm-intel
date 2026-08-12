import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareCalibrationQueues } from "@/lib/portfolio-iq/calibration-impact";
import { buildOwnerAttentionQueue, type TodaySignalCandidate } from "@/lib/portfolio-iq/today";

type Candidate = TodaySignalCandidate & { headline: string };

function candidate(id: string, rankScore: number, signalType = "rent_softening"): Candidate {
  return {
    id,
    headline: `Finding ${id}`,
    assetId: `asset-${id}`,
    category: "market",
    severity: "high",
    confidence: "high",
    rankScore,
    signalType,
    evidence: JSON.stringify({ observations: 30 }),
    evidenceSources: JSON.stringify(["dwellsy_iq_trends", "owner_portfolio"]),
    observedAt: new Date("2026-08-11T00:00:00Z"),
  };
}

test("shadow comparison shows which finding leaves and enters Today", () => {
  const signals = [candidate("a", 95), candidate("b", 93, "other"), candidate("c", 91, "other"), candidate("d", 89, "other")];
  const current = buildOwnerAttentionQueue(signals, { limit: 3, now: new Date("2026-08-11T00:00:00Z") });
  const proposed = buildOwnerAttentionQueue(signals, { limit: 3, now: new Date("2026-08-11T00:00:00Z"), calibrationAdjustments: new Map([["signal_type:rent_softening", -15]]) });
  const impact = compareCalibrationQueues(current, proposed);
  assert.equal(impact.leftToday, 1);
  assert.equal(impact.enteredToday, 1);
  assert.deepEqual(impact.currentTodayIds, ["a", "b", "c"]);
  assert.deepEqual(impact.proposedTodayIds, ["b", "c", "d"]);
  assert.deepEqual(new Set(impact.affectedAssetIds), new Set(["asset-a", "asset-b", "asset-c", "asset-d"]));
});

test("impact snapshots are additive and approval remains administrator-only", () => {
  const migration = readFileSync("prisma/migrations/20260812030000_portfolio_iq_calibration_impact/migration.sql", "utf8");
  const page = readFileSync("src/app/admin/portfolio-activation/page.tsx", "utf8");
  const actions = readFileSync("src/app/admin/portfolio-activation/actions.ts", "utf8");
  assert.match(migration, /ADD COLUMN "impactSnapshot"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PropertyManager"|ALTER TABLE "CanonicalOperator"/);
  assert.match(page, /!userId \|\| !isAdminUser\(userId\)/);
  assert.match(actions, /export async function rollbackFindingCalibration/);
  assert.match(actions, /impactSnapshot: JSON\.stringify\(impact\)/);
});
