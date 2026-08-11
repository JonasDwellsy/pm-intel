import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOwnerWatchGroups, type OwnerWatchCandidate } from "@/lib/portfolio-iq/owner-watchlist";

const candidate = (overrides: Partial<OwnerWatchCandidate>): OwnerWatchCandidate => ({
  objectType: "property", objectKey: "asset-1", label: "The Acadian Apartments", href: "/portfolio-iq/properties/acadian-apartments",
  detail: "Brook Park, OH", signalCount: 2, priority: 20, source: "Portfolio IQ", ...overrides,
});

test("owner watchlist puts explicit pins first without hiding automatic monitoring", () => {
  const groups = buildOwnerWatchGroups({
    candidates: [
      candidate({ objectKey: "asset-1", priority: 90 }),
      candidate({ objectType: "geography", objectKey: "zip:44142", label: "ZIP 44142", source: "Market IQ", priority: 25 }),
      candidate({ objectType: "operator", objectKey: "example-pm", label: "Example PM", source: "Operator IQ", priority: 40 }),
    ],
    pins: [{ objectType: "geography", objectKey: "zip:44142" }],
  });
  assert.equal(groups.pinned[0]?.label, "ZIP 44142");
  assert.equal(groups.properties.length, 1);
  assert.equal(groups.geographies.length, 1);
  assert.equal(groups.operators.length, 1);
  assert.equal(groups.properties[0]?.pinned, false);
});

test("owner watchlist migration and route remain additive to both existing watchlist products", () => {
  const migration = readFileSync("prisma/migrations/20260811150000_portfolio_iq_owner_watchlist/migration.sql", "utf8");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const navigation = readFileSync("src/components/dwellsy-iq/DwellsyIqWorkspaceNav.tsx", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqOwnerWatchItem"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "WatchList"|ALTER TABLE "MarketIqWatchlist"/);
  assert.match(schema, /model WatchList/);
  assert.match(schema, /model MarketIqWatchlist/);
  assert.match(schema, /model PortfolioIqOwnerWatchItem/);
  assert.match(navigation, /portfolio-iq\/watchlists/);
});
