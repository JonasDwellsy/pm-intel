import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMarketIqReportSnapshot, isPublicMarketIqReportStatus, parseMarketIqReportSnapshot } from "./report";
import { canAccessMarketIqReportComposer } from "./access";
import { buildMarketIqReportEmail } from "./email";
import { seededClevelandMarketReport } from "./seeded-cleveland";

const baseInput = {
  generatedAt: new Date("2026-08-14T00:00:00.000Z"),
  brand: { displayName: "Test Residential", logoUrl: null, primaryColor: "#123456", accentColor: "#987654", contactName: null, contactEmail: null, contactPhone: null, websiteUrl: null },
  scope: { marketId: "cleveland", marketName: "Cleveland-Elyria, OH", cities: ["Cleveland"], zipCodes: ["44114"], segments: ["Apartments by bedroom"], periodStart: "2025-08-01", periodEnd: "2026-07-31", seededExample: true },
  marketConditions: { heading: "Supply increased", narrative: "Observed advertised supply increased.", historical: null },
  sources: [{ name: "Total IQ", availableThrough: "2026-07-31", observationCount: 100, note: "Observed asking listings." }],
};

describe("Market IQ local market read assembly", () => {
  it("publishes a defensible market cell with level, trajectory, sample, and date", () => {
    const report = buildMarketIqReportSnapshot({ ...baseInput, trendSeries: [{ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "apartment", bedrooms: 1, points: [{ rent: 1_025, yearOverYearPct: 2.5, observations: 20, month: "2026-07-01" }] }] });
    expect(report.marketRead.cells).toHaveLength(1);
    expect(report.marketRead.cells[0]).toMatchObject({ status: "reportable", rent: 1_025, yearOverYearPct: 2.5, observations: 20, month: "2026-07-01" });
    expect(report.methodNote).toMatch(/Every published rent level and change is a Trends IQ statistic/);
    expect(JSON.stringify(report)).not.toMatch(/portfolioPosition|positionPct|competitor/i);
  });

  it("suppresses a thin rent-level cell and withholds a thin trajectory", () => {
    const report = buildMarketIqReportSnapshot({ ...baseInput, trendSeries: [{ geographyType: "zip", geographyValue: "44114", geographyLabel: "ZIP 44114", propertyType: "apartment", bedrooms: 1, points: [{ rent: 1_025, yearOverYearPct: 2.5, observations: 9, month: "2026-07-01" }] }], mapCenters: { "44114": { latitude: 41.5, longitude: -81.67 } } });
    expect(report.marketRead.cells[0]).toMatchObject({ status: "suppressed", rent: null, yearOverYearPct: null, observations: 9 });
    expect(report.marketRead.cells[0].suppressionReason).toMatch(/10 observations/);
    expect(report.marketMap.points[0]).toMatchObject({ zip: "44114", status: "suppressed", rent: null });
  });

  it("parses only Revision 4 market-read snapshots", () => {
    expect(parseMarketIqReportSnapshot(JSON.stringify(seededClevelandMarketReport))).toEqual(seededClevelandMarketReport);
    expect(parseMarketIqReportSnapshot('{"version":1}')).toBeNull();
    expect(parseMarketIqReportSnapshot("not json")).toBeNull();
  });
});

describe("Market IQ report migration", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync("prisma/migrations/20260814070000_market_iq_reports/migration.sql", "utf8");
  it("adds the isolated report workflow models and relations", () => {
    for (const model of ["OrganizationBrandProfile", "MarketIqReport", "MarketIqReportRecipient", "MarketIqReportSend"]) {
      expect(schema).toMatch(new RegExp(`model ${model} \\{`));
      expect(migration).toMatch(new RegExp(`CREATE TABLE "${model}"`));
    }
    expect(schema).toMatch(/marketIqReports\s+MarketIqReport\[\]/);
    expect(schema).toMatch(/marketIqReportSends\s+MarketIqReportSend\[\]/);
  });
  it("contains no destructive statements", () => { expect(migration).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im); });
});

describe("Market IQ report access boundaries", () => {
  const allowed = { previewEnabled: true, userId: "user_1", organizationId: "org_1", hasProduct: true, marketEntitled: true };
  it("fails closed when any composer entitlement is missing", () => {
    expect(canAccessMarketIqReportComposer(allowed)).toBe(true);
    expect(canAccessMarketIqReportComposer({ ...allowed, previewEnabled: false })).toBe(false);
    expect(canAccessMarketIqReportComposer({ ...allowed, userId: null })).toBe(false);
    expect(canAccessMarketIqReportComposer({ ...allowed, organizationId: null })).toBe(false);
    expect(canAccessMarketIqReportComposer({ ...allowed, hasProduct: false })).toBe(false);
    expect(canAccessMarketIqReportComposer({ ...allowed, marketEntitled: false })).toBe(false);
  });
  it("exposes only published report snapshots", () => { expect(isPublicMarketIqReportStatus("published")).toBe(true); expect(isPublicMarketIqReportStatus("draft")).toBe(false); expect(isPublicMarketIqReportStatus("revoked")).toBe(false); });
});

describe("Market IQ report email", () => {
  it("keeps the message PM-branded and market-only", () => {
    const email = buildMarketIqReportEmail({ recipientName: "Avery Owner", recipientKind: "client", report: seededClevelandMarketReport, reportUrl: "https://market.example/reports/market/token", pdfUrl: "https://market.example/reports/market/token/pdf" });
    expect(email.subject).toMatch(/^Harborview Residential/);
    expect(email.html).toContain("Explore the market read");
    expect(email.html).toContain("PDF export");
    expect(email.html).toContain("Market data by Dwellsy IQ");
    expect(email.html).not.toContain("Open Market IQ");
    expect(email.html).not.toMatch(/portfolio position|competitor|Operator IQ/i);
    expect(email.text).toContain("advertised asking-market activity");
  });
  it("escapes recipient and brand-controlled content", () => {
    const email = buildMarketIqReportEmail({ recipientName: "<script>alert(1)</script>", recipientKind: "prospect", report: { ...seededClevelandMarketReport, brand: { ...seededClevelandMarketReport.brand, displayName: "A&B <Advisors>" } }, reportUrl: "https://market.example/report?a=1&b=2", pdfUrl: "https://market.example/report/pdf" });
    expect(email.html).toContain("A&amp;B &lt;Advisors&gt;");
    expect(email.html).not.toContain("<script>");
  });
});
