import assert from "node:assert/strict";
import test from "node:test";
import { routeOwnerAttention } from "@/lib/portfolio-iq/owner-attention-routing";
import type { OwnerWatchActivityEvent } from "@/lib/portfolio-iq/owner-watch-activity";

const event = (overrides: Partial<OwnerWatchActivityEvent & { isNew: boolean }>): OwnerWatchActivityEvent & { isNew: boolean } => ({
  id: "event", kind: "evidence", headline: "Asking rent changed", detail: "Observed evidence changed.", href: "/today/cases/signal",
  severity: "medium", occurredAt: new Date("2026-08-11T12:00:00Z"), objects: [], isNew: true, ...overrides,
});

test("routing favors source exceptions, outcomes, and decisions over ordinary evidence", () => {
  const result = routeOwnerAttention({ events: [
    event({ id: "evidence" }),
    event({ id: "decision", kind: "decision" }),
    event({ id: "outcome", kind: "outcome" }),
    event({ id: "source", kind: "source", severity: "info" }),
  ] });
  assert.deepEqual(result.routed.map((item) => item.id), ["source", "outcome", "decision", "evidence"]);
});

test("routing excludes reviewed and informational setup evidence", () => {
  const result = routeOwnerAttention({ events: [
    event({ id: "reviewed", isNew: false, severity: "high" }),
    event({ id: "setup", severity: "info" }),
    event({ id: "material", severity: "high" }),
  ] });
  assert.deepEqual(result.routed.map((item) => item.id), ["material"]);
  assert.equal(result.eligibleUnreadCount, 1);
});

test("briefing cutoff stays separate from in-app review state", () => {
  const result = routeOwnerAttention({ events: [
    event({ id: "before", occurredAt: new Date("2026-08-09T12:00:00Z") }),
    event({ id: "after", occurredAt: new Date("2026-08-11T12:00:00Z") }),
  ], since: new Date("2026-08-10T12:00:00Z") });
  assert.deepEqual(result.routed.map((item) => item.id), ["after"]);
});
