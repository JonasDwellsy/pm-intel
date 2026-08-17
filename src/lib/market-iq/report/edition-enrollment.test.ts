import assert from "node:assert/strict";
import test from "node:test";
import { buildEditionEnrollmentReadiness } from "./edition-enrollment";

function readiness(overrides: Partial<Parameters<typeof buildEditionEnrollmentReadiness>[0]> = {}) {
  return buildEditionEnrollmentReadiness({
    hasCommercialAccess: true,
    hasBrandProfile: true,
    onboardingCompleted: true,
    hasSavedGeography: true,
    hasSavedSegment: true,
    sourceIsAuthoritative: true,
    sourceAvailableThrough: "2026-07-31",
    hasPublishedBaseline: true,
    recurringEditionsEnabled: false,
    ...overrides,
  });
}

test("a fully prepared workspace can enroll but is not scheduled until it opts in", () => {
  const result = readiness();
  assert.equal(result.prerequisitesPassed, true);
  assert.equal(result.enrolled, false);
  assert.equal(result.readyForScheduler, false);
  assert.deepEqual(result.blockers, []);
});

test("an enrolled workspace is scheduler-ready only when every prerequisite passes", () => {
  assert.equal(readiness({ recurringEditionsEnabled: true }).readyForScheduler, true);
  const blocked = readiness({ recurringEditionsEnabled: true, hasPublishedBaseline: false });
  assert.equal(blocked.readyForScheduler, false);
  assert.deepEqual(blocked.blockers.map((check) => check.id), ["baseline"]);
});

test("saved scope requires completed activation, geography, and segment", () => {
  for (const input of [
    { onboardingCompleted: false },
    { hasSavedGeography: false },
    { hasSavedSegment: false },
  ]) {
    const result = readiness(input);
    assert.equal(result.checks.find((check) => check.id === "scope")?.passed, false);
  }
});

test("preview data remains a hard enrollment blocker", () => {
  const result = readiness({ sourceIsAuthoritative: false });
  assert.equal(result.prerequisitesPassed, false);
  assert.deepEqual(result.blockers.map((check) => check.id), ["source"]);
});
