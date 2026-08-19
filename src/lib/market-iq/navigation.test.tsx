import { describe, expect, it } from "vitest";
import { marketIqClientReportingTab, marketIqProductArea } from "@/lib/market-iq/navigation";

describe("Market IQ navigation", () => {
  it("groups the internal briefing under Market intelligence", () => {
    expect(marketIqProductArea("/market-iq/market")).toBe("market-intelligence");
    expect(marketIqProductArea("/market-iq/briefing")).toBe("market-intelligence");
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
