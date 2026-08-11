import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deriveDecisionLedgerStage, summarizeDecisionLedger, type DecisionLedgerRow } from "@/lib/portfolio-iq/decision-ledger";

const now = new Date("2026-08-11T12:00:00Z");

function stage(overrides: Partial<Parameters<typeof deriveDecisionLedgerStage>[0]> = {}) {
  return deriveDecisionLedgerStage({ decisionState: "acknowledged", baselineCapturedAt: null, dueAt: null, briefStatus: null, pmDisposition: null, latestOutcome: null, now, ...overrides });
}

test("decision ledger routes every point in the owner and PM loop", () => {
  assert.equal(stage(), "action_planned");
  assert.equal(stage({ briefStatus: "published" }), "awaiting_pm");
  assert.equal(stage({ pmDisposition: "pending" }), "owner_review");
  assert.equal(stage({ baselineCapturedAt: new Date("2026-08-01T00:00:00Z"), dueAt: new Date("2026-09-01T00:00:00Z") }), "monitoring");
  assert.equal(stage({ baselineCapturedAt: new Date("2026-08-01T00:00:00Z"), dueAt: new Date("2026-08-10T00:00:00Z") }), "outcome_due");
  assert.equal(stage({ latestOutcome: { status: "reviewed", nextDecision: "adjust" } }), "follow_up");
  assert.equal(stage({ decisionState: "resolved" }), "closed");
});

test("decision ledger counts financial priority once per asset", () => {
  const base: DecisionLedgerRow = { signalId: "one", state: "acknowledged", stage: "monitoring", assignedTo: "Avery", hasActionPlan: true, acceptedPmPlan: true, pmResponseDays: 2, pmRespondedOnTime: true, implementationStatus: null, outcomeConclusion: null, nextDecision: null, financialPriorities: [{ assetId: "asset-1", amount: 12000 }] };
  const summary = summarizeDecisionLedger([
    base,
    { ...base, signalId: "two", stage: "closed", implementationStatus: "completed", outcomeConclusion: "improved", nextDecision: "close", financialPriorities: [{ assetId: "asset-1", amount: 12000 }, { assetId: "asset-2", amount: 6000 }] },
  ]);
  assert.equal(summary.askingRentPriority, 18000);
  assert.equal(summary.financiallyPrioritizedAssets, 2);
  assert.equal(summary.loopsClosed, 1);
  assert.equal(summary.implementationConfirmed, 1);
  assert.equal(summary.medianPmResponseDays, 2);
});

test("decision ledger remains an asking-market accountability record", async () => {
  const [page, server, nav] = await Promise.all([
    readFile("src/app/portfolio-iq/decision-ledger/page.tsx", "utf8"),
    readFile("src/lib/portfolio-iq/decision-ledger.server.ts", "utf8"),
    readFile("src/components/dwellsy-iq/DwellsyIqWorkspaceNav.tsx", "utf8"),
  ]);
  assert.match(page, /what Dwellsy IQ surfaced, what the owner decided/);
  assert.match(page, /do not represent occupancy, signed leases, concessions, effective rent, realized revenue, NOI/);
  assert.match(server, /ownerDisposition/);
  assert.match(server, /implementationStatus/);
  assert.match(server, /financialByAsset/);
  assert.match(nav, /portfolio-iq\/decision-ledger/);
});
