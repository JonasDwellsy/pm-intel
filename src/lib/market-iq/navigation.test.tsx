import { describe, expect, it } from "vitest";
import {
  MARKET_IQ_CANONICAL_ROUTES,
  MARKET_IQ_MARKET_INTELLIGENCE_ROUTES,
  marketIqClientReportingTab,
  marketIqProductArea,
} from "@/lib/market-iq/navigation";

describe("Market IQ navigation", () => {
  it("groups the internal briefing under Market intelligence", () => {
    expect(marketIqProductArea("/market-iq/daily")).toBe("market-intelligence");
    expect(marketIqProductArea("/market-iq/market")).toBe("market-intelligence");
    expect(marketIqProductArea("/market-iq/briefing")).toBe("market-intelligence");
  });

  it("makes Daily Edition canonical without erasing the monthly overview route", () => {
    expect(MARKET_IQ_CANONICAL_ROUTES.marketIntelligence).toBe("/market-iq/daily");
    expect(MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.daily).toBe("/market-iq/daily");
    expect(MARKET_IQ_MARKET_INTELLIGENCE_ROUTES.overview).toBe("/market-iq/market");
  });

  it("groups the reporting workflow under Client reporting", () => {
    expect(marketIqProductArea("/market-iq/editions")).toBe("client-reporting");
    expect(marketIqProductArea("/market-iq/client-reporting")).toBe("client-reporting");
    expect(marketIqProductArea("/market-iq/distribution")).toBe("client-reporting");
    expect(marketIqProductArea("/market-iq/sharing")).toBe("client-reporting");
    expect(marketIqProductArea("/market-iq/performance")).toBe("client-reporting");
  });

  it("distinguishes the five Client reporting work areas", () => {
    expect(marketIqClientReportingTab("/market-iq/client-reporting")).toBe("overview");
    expect(marketIqClientReportingTab("/market-iq/editions")).toBe("reports");
    expect(marketIqClientReportingTab("/market-iq/distribution")).toBe("recipients");
    expect(marketIqClientReportingTab("/market-iq/distribution/campaign-1")).toBe("delivery");
    expect(marketIqClientReportingTab("/market-iq/performance")).toBe("performance");
  });
});
