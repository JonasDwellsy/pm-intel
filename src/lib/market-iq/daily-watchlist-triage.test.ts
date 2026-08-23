import { describe, expect, it } from "vitest";

import { parseMarketIqDailyTriageNote, parseMarketIqDailyTriageStatus } from "@/lib/market-iq/daily-watchlist-triage";

describe("Daily watchlist triage contracts", () => {
  it("accepts only the four explicit workflow states", () => {
    expect(parseMarketIqDailyTriageStatus("new")).toBe("new");
    expect(parseMarketIqDailyTriageStatus("reviewing")).toBe("reviewing");
    expect(parseMarketIqDailyTriageStatus("dismissed")).toBe("dismissed");
    expect(parseMarketIqDailyTriageStatus("resolved")).toBe("resolved");
    expect(parseMarketIqDailyTriageStatus("deleted")).toBeNull();
  });

  it("trims bounded notes and rejects empty or oversized content", () => {
    expect(parseMarketIqDailyTriageNote("  Check this property.  ")).toBe("Check this property.");
    expect(parseMarketIqDailyTriageNote("   ")).toBeNull();
    expect(parseMarketIqDailyTriageNote("x".repeat(1_001))).toBeNull();
  });
});
