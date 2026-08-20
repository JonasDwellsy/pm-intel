import assert from "node:assert/strict";
import test from "node:test";
import { decideRecurringEdition } from "@/lib/market-iq/report/recurring-edition";

test("creates a draft only after authoritative Trends advances", () => {
  assert.deepEqual(decideRecurringEdition({ source: "dwellsy_trends", currentPeriodEnd: "2026-08-31", priorPeriodEnd: "2026-07-31", readinessPassed: true, draftExists: false }), { action: "create" });
});

test("never creates a recurring draft when the source is unavailable", () => {
  assert.deepEqual(decideRecurringEdition({ source: "unavailable", currentPeriodEnd: "2026-08-31", priorPeriodEnd: "2026-07-31", readinessPassed: true, draftExists: false }), { action: "skip", reason: "source_unavailable" });
});

test("same-period checks and retries are idempotent", () => {
  assert.deepEqual(decideRecurringEdition({ source: "dwellsy_trends", currentPeriodEnd: "2026-07-31", priorPeriodEnd: "2026-07-31", readinessPassed: true, draftExists: false }), { action: "skip", reason: "same_period" });
  assert.deepEqual(decideRecurringEdition({ source: "dwellsy_trends", currentPeriodEnd: "2026-08-31", priorPeriodEnd: "2026-07-31", readinessPassed: true, draftExists: true }), { action: "skip", reason: "draft_exists" });
});
