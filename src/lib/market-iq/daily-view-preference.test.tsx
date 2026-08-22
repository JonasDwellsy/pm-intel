import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isMissingDailyViewPreferenceTableError } from "@/lib/market-iq/daily-view-preference";

describe("Daily view preference persistence boundary", () => {
  it("uses an additive user-and-market-scoped table without modifying workspace scope", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260822150000_market_iq_daily_view_preferences/migration.sql"), "utf8");
    expect(migration).toContain("CREATE TABLE \"MarketIqDailyViewPreference\"");
    expect(migration).toContain("organizationId_userId_marketId_key");
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).not.toMatch(/ALTER TABLE \"MarketIqWorkspacePreference\"/);
    expect(migration).not.toMatch(/DROP|TRUNCATE/i);
  });

  it("authorizes writes against the active viewer and market entitlement", () => {
    const actions = fs.readFileSync(path.join(process.cwd(), "src/app/market-iq/daily/actions.ts"), "utf8");
    expect(actions).toContain("getActiveOrgContext()");
    expect(actions).toContain("resolveViewerMarketIqAccess()");
    expect(actions).toContain("listEntitledMarketIqMarkets(access.entitlement)");
    expect(actions).toContain("organizationId_userId_marketId");
    expect(actions).not.toContain("marketIqWorkspacePreference");
    expect(actions).not.toContain("marketIqMarketPreference");
  });

  it("fails open only when the optional preference table is missing", () => {
    expect(isMissingDailyViewPreferenceTableError({
      code: "P2021",
      meta: {
        modelName: "MarketIqDailyViewPreference",
        table: "public.MarketIqDailyViewPreference",
      },
    })).toBe(true);
    expect(isMissingDailyViewPreferenceTableError({ code: "P2021" })).toBe(true);
    expect(isMissingDailyViewPreferenceTableError({
      code: "P2021",
      meta: { modelName: "Organization", table: "public.Organization" },
    })).toBe(false);
    expect(isMissingDailyViewPreferenceTableError({ code: "P1001" })).toBe(false);
    expect(isMissingDailyViewPreferenceTableError(new Error("connection failed"))).toBe(false);

    const loader = fs.readFileSync(path.join(process.cwd(), "src/lib/market-iq/daily-view-preference.server.ts"), "utf8");
    expect(loader).toContain("isMissingDailyViewPreferenceTableError(error)");
    expect(loader).toContain("if (isMissingDailyViewPreferenceTableError(error)) return null");
    expect(loader).toContain("throw error");
  });
});
