import assert from "node:assert/strict";
import test from "node:test";
import { routeOwnerAttention } from "@/lib/portfolio-iq/owner-attention-routing";
import type { OwnerWatchActivityEvent } from "@/lib/portfolio-iq/owner-watch-activity";

const event = (overrides: Partial<OwnerWatchActivityEvent & { isNew: boolean }>): OwnerWatchActivityEvent & { isNew: boolean } => ({
  id: "event", kind: "evidence", headline: "Asking rent changed", detail: "Observed evidence changed.", href: "/today/cases/signal",
  severity: "medium", occurredAt: new Date("2026-08-11T12:00:00Z"), objects: [], isNew: true, ...overrides,
});

test("routing favors outcomes and decisions while source exceptions go to setup", () => {
  const result = routeOwnerAttention({ events: [
    event({ id: "evidence" }),
    event({ id: "decision", kind: "decision" }),
    event({ id: "outcome", kind: "outcome" }),
    event({ id: "source", kind: "source", severity: "info" }),
  ] });
  assert.deepEqual(result.routed.map((item) => item.id), ["outcome", "decision", "evidence"]);
  assert.deepEqual(result.destinations.setup.map((item) => item.id), ["source"]);
});

test("routing excludes reviewed evidence and holds informational evidence on the watchlist", () => {
  const result = routeOwnerAttention({ events: [
    event({ id: "reviewed", isNew: false, severity: "high" }),
    event({ id: "setup", severity: "info" }),
    event({ id: "material", severity: "high" }),
  ] });
  assert.deepEqual(result.routed.map((item) => item.id), ["material"]);
  assert.equal(result.eligibleUnreadCount, 1);
  assert.deepEqual(result.destinations.watchlist.map((item) => item.id), ["setup"]);
});

test("briefing cutoff stays separate from in-app review state", () => {
  const result = routeOwnerAttention({ events: [
    event({ id: "before", occurredAt: new Date("2026-08-09T12:00:00Z") }),
    event({ id: "after", occurredAt: new Date("2026-08-11T12:00:00Z") }),
  ], since: new Date("2026-08-10T12:00:00Z") });
  assert.deepEqual(result.routed.map((item) => item.id), ["after"]);
});

test("related evidence, decision, and outcome events become one finding", () => {
  const decisionObject = { objectType: "decision", objectKey: "signal-1", label: "Review Acadian pricing" };
  const result = routeOwnerAttention({ events: [
    event({ id: "evidence", headline: "Acadian one-bedrooms lost rent position", kind: "evidence", objects: [decisionObject], occurredAt: new Date("2026-08-09T12:00:00Z") }),
    event({ id: "decision", headline: "Action plan updated", kind: "decision", objects: [decisionObject], occurredAt: new Date("2026-08-10T12:00:00Z") }),
    event({ id: "outcome", headline: "Outcome review available", kind: "outcome", objects: [decisionObject], occurredAt: new Date("2026-08-11T12:00:00Z") }),
  ] });

  assert.equal(result.eligibleUnreadCount, 1);
  assert.equal(result.routed.length, 1);
  assert.equal(result.routed[0].headline, "Acadian one-bedrooms lost rent position");
  assert.equal(result.routed[0].eventCount, 3);
  assert.deepEqual(result.routed[0].kinds, ["evidence", "decision", "outcome"]);
  assert.match(result.routed[0].detail, /3 connected updates/);
  assert.match(result.routed[0].detail, /Latest: Outcome review available/);
});

test("unrelated decisions remain separate findings even when they share a property", () => {
  const propertyObject = { objectType: "property", objectKey: "acadian", label: "Acadian Apartments" };
  const result = routeOwnerAttention({ events: [
    event({ id: "one", objects: [propertyObject, { objectType: "decision", objectKey: "signal-1", label: "First decision" }] }),
    event({ id: "two", objects: [propertyObject, { objectType: "decision", objectKey: "signal-2", label: "Second decision" }] }),
  ] });

  assert.equal(result.eligibleUnreadCount, 2);
  assert.equal(result.routed.length, 2);
});

test("evidence gates route setup, developing, and decision-ready findings separately", () => {
  const result = routeOwnerAttention({ events: [
    event({ id: "ready", severity: "medium", evidenceGate: { category: "market", confidence: "high" } }),
    event({ id: "developing", severity: "medium", evidenceGate: { category: "performance", confidence: "medium" } }),
    event({ id: "activation", severity: "high", evidenceGate: { category: "readiness", confidence: "setup" } }),
  ] });

  assert.deepEqual(result.destinations.today.map((item) => item.id), ["ready"]);
  assert.deepEqual(result.destinations.watchlist.map((item) => item.id), ["developing"]);
  assert.deepEqual(result.destinations.setup.map((item) => item.id), ["activation"]);
  assert.equal(result.totalUnreadFindingCount, 3);
});
