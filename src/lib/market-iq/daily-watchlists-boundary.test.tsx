import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isMissingDailyWatchlistTableError } from "@/lib/market-iq/daily-watchlists-persistence";

describe("personal Daily Watchlist boundary", () => {
  it("uses an additive user-and-market-scoped model", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260822233000_market_iq_daily_watchlists/migration.sql"), "utf8");
    expect(migration).toContain("CREATE TABLE \"MarketIqDailyWatchlist\"");
    expect(migration).toContain("organizationId_userId_marketId_name_key");
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).not.toMatch(/ALTER TABLE \"MarketIqWatchlist\"/);
    expect(migration).not.toMatch(/ALTER TABLE \"MarketIqDailyViewPreference\"/);
    expect(migration).not.toMatch(/DROP|TRUNCATE/i);
  });

  it("fails closed on every mutation across organization, user, and market", () => {
    const actions = fs.readFileSync(path.join(process.cwd(), "src/app/market-iq/daily/actions.ts"), "utf8");
    expect(actions).toContain("authorizedContext(marketId)");
    expect(actions).toContain("listEntitledMarketIqMarkets(access.entitlement)");
    expect(actions).toMatch(/updateMany\([\s\S]*where: \{ id: parsed\.value\.id, \.\.\.context, marketId \}/);
    expect(actions).toMatch(/deleteMany\([\s\S]*where: \{ id: watchlistId, \.\.\.context, marketId \}/);
    expect(actions).not.toContain("marketIqWatchlist.update(");
  });

  it("keeps daily matching structurally isolated from monthly trend contracts", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/market-iq/daily-watchlists.ts"), "utf8");
    expect(source).toContain("@/lib/market-iq/daily-events");
    expect(source).toContain("@/lib/market-iq/listing-events");
    expect(source).not.toMatch(/MarketIqTrend|\/alerts|\/trends/);
  });

  it("tolerates only the absent optional watchlist table", () => {
    expect(isMissingDailyWatchlistTableError({ code: "P2021", meta: { modelName: "MarketIqDailyWatchlist" } })).toBe(true);
    expect(isMissingDailyWatchlistTableError({ code: "P2021", meta: { modelName: "Organization" } })).toBe(false);
    expect(isMissingDailyWatchlistTableError({ code: "P1001" })).toBe(false);
  });
});
