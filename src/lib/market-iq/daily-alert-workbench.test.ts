import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS,
  filterMarketIqAlertWorkbenchItems,
  marketIqAlertWorkbenchCounts,
  parseMarketIqAlertWorkbenchBulkInput,
  type MarketIqAlertWorkbenchItem,
} from "@/lib/market-iq/daily-alert-workbench";

function item(input: Partial<MarketIqAlertWorkbenchItem> & Pick<MarketIqAlertWorkbenchItem, "id">): MarketIqAlertWorkbenchItem {
  const { id, ...overrides } = input;
  return {
    id,
    watchlistId: "watch-team",
    watchlistName: "Downtown competitors",
    watchlistVisibility: "organization",
    marketId: "cleveland-elyria-mentor-oh",
    marketName: "Cleveland",
    editionId: "edition-1",
    eventKey: `price_change:${input.id}`,
    eventType: "price_change",
    headline: "Rent changed at 100 Main St",
    detail: "Advertised asking rent fell by $100.",
    observedAt: "2026-08-23T03:00:00.000Z",
    city: "Cleveland",
    propertyManagerName: "Northstar Residential",
    propertyId: "property-1",
    sectionHref: "#daily-rent-moves",
    readAt: null,
    emailedAt: null,
    triage: { status: "new", assignedToUserId: null, notes: [] },
    ...overrides,
  };
}

const items = [
  item({ id: "open-unassigned" }),
  item({ id: "mine", triage: { status: "reviewing", assignedToUserId: "viewer", notes: [] }, observedAt: "2026-08-22T03:00:00.000Z" }),
  item({ id: "resolved", watchlistId: "watch-private", watchlistName: "My watch", watchlistVisibility: "private", marketId: "columbus-oh", marketName: "Columbus", triage: { status: "resolved", assignedToUserId: "other", notes: [] }, observedAt: "2026-08-21T03:00:00.000Z" }),
];

describe("Market IQ alert workbench", () => {
  it("counts open, assigned-to-me, unassigned, and all recipient-scoped alerts", () => {
    assert.deepEqual(marketIqAlertWorkbenchCounts(items, "viewer"), { open: 2, mine: 1, unassigned: 1, all: 3 });
  });

  it("filters the operational scopes without treating resolved work as open", () => {
    assert.deepEqual(filterMarketIqAlertWorkbenchItems(items, EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS, "viewer").map((entry) => entry.id), ["open-unassigned", "mine"]);
    assert.deepEqual(filterMarketIqAlertWorkbenchItems(items, { ...EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS, scope: "mine" }, "viewer").map((entry) => entry.id), ["mine"]);
    assert.deepEqual(filterMarketIqAlertWorkbenchItems(items, { ...EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS, scope: "unassigned" }, "viewer").map((entry) => entry.id), ["open-unassigned"]);
  });

  it("supports personal, market, assignee, free-text, and oldest-first filters", () => {
    const filtered = filterMarketIqAlertWorkbenchItems(items, {
      ...EMPTY_MARKET_IQ_ALERT_WORKBENCH_FILTERS,
      scope: "all",
      visibility: "private",
      marketId: "columbus-oh",
      assignee: "other",
      query: "My watch",
      sort: "oldest",
    }, "viewer");
    assert.deepEqual(filtered.map((entry) => entry.id), ["resolved"]);
  });

  it("accepts bounded bulk status and assignment changes and rejects empty updates", () => {
    assert.deepEqual(parseMarketIqAlertWorkbenchBulkInput({ status: "resolved", assignedToUserId: "viewer" }), { ok: true, value: { status: "resolved", assignedToUserId: "viewer" } });
    assert.equal(parseMarketIqAlertWorkbenchBulkInput({ assignedToUserId: null }).ok, true);
    assert.equal(parseMarketIqAlertWorkbenchBulkInput({}).ok, false);
    assert.equal(parseMarketIqAlertWorkbenchBulkInput({ status: "deleted" }).ok, false);
    assert.equal(parseMarketIqAlertWorkbenchBulkInput({ assignedToUserId: "x".repeat(101) }).ok, false);
  });
});
