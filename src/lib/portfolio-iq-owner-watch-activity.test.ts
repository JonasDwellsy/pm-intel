import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOwnerWatchActivity, type OwnerWatchActivityEvent } from "@/lib/portfolio-iq/owner-watch-activity";

const event = (overrides: Partial<OwnerWatchActivityEvent>): OwnerWatchActivityEvent => ({
  id: "event-1", kind: "evidence", headline: "Rent position changed", detail: "Observed asking rent moved.", href: "/today/cases/signal-1",
  severity: "high", occurredAt: new Date("2026-08-11T12:00:00Z"), objects: [{ objectType: "property", objectKey: "asset-1", label: "The Acadian Apartments" }], ...overrides,
});

test("watch activity is personal and compares each object to its own review watermark", () => {
  const activity = buildOwnerWatchActivity({
    events: [
      event({ id: "new", occurredAt: new Date("2026-08-11T12:00:00Z") }),
      event({ id: "old", occurredAt: new Date("2026-08-09T12:00:00Z") }),
    ],
    pinnedObjects: [{ objectType: "property", objectKey: "asset-1" }],
    reviews: [{ objectType: "property", objectKey: "asset-1", reviewedThrough: new Date("2026-08-10T12:00:00Z") }],
  });
  assert.deepEqual(activity.newEvents.map((item) => item.id), ["new"]);
  assert.deepEqual(activity.priorEvents.map((item) => item.id), ["old"]);
  assert.equal(activity.isFocused, true);
});

test("pins focus object activity but source-health events remain visible", () => {
  const activity = buildOwnerWatchActivity({
    events: [
      event({ id: "unpinned", objects: [{ objectType: "property", objectKey: "asset-2", label: "Other property" }] }),
      event({ id: "source", kind: "source", objects: [{ objectType: "watchlist", objectKey: "all", label: "Owner Watchlist" }] }),
    ],
    pinnedObjects: [{ objectType: "property", objectKey: "asset-1" }], reviews: [],
  });
  assert.deepEqual(activity.events.map((item) => item.id), ["source"]);
});

test("review migration is additive and never alters shared evidence or Operator IQ tables", () => {
  const migration = readFileSync("prisma/migrations/20260811160000_portfolio_iq_owner_watch_review/migration.sql", "utf8");
  const action = readFileSync("src/app/portfolio-iq/watchlists/activity/actions.ts", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqOwnerWatchReview"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "WatchList"|ALTER TABLE "PortfolioIqSignal"|ALTER TABLE "PortfolioIqSignalDecision"/);
  assert.match(action, /portfolioIqOwnerWatchReview\.upsert/);
  assert.doesNotMatch(action, /portfolioIqSignalDecision\.(update|upsert)|portfolioIqSignal\.(update|upsert)/);
});
