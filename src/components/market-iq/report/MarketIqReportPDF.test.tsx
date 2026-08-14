import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { seededClevelandMarketReport } from "@/lib/market-iq/report/seeded-cleveland";
import { MarketIqReportPDF } from "./MarketIqReportPDF";

describe("MarketIqReportPDF", () => {
  it("renders the immutable PM-branded snapshot as a PDF", async () => {
    const buffer = await renderToBuffer(<MarketIqReportPDF report={seededClevelandMarketReport} />);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(10_000);
  });
});
