import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildMarketIqReportSnapshot, isPublicMarketIqReportStatus, parseMarketIqReportSnapshot } from "./report";
import { canAccessMarketIqReportComposer } from "./access";
import { buildMarketIqReportEmail } from "./email";
import { compareMarketIqEditions } from "./edition-comparison";
import { seededClevelandMarketReport } from "./seeded-cleveland";
import { applyMarketIqReportScope, buildMarketIqCoveragePreflight, normalizeMarketIqScopeSelection } from "./scope";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";

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
    expect(report.methodNote).toMatch(/Every published rent input comes from Trends IQ/);
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

  it("ships source-dated ZIP Trends cells in the Cleveland preview snapshot", () => {
    expect(seededClevelandMarketReport.marketRead.cells.find((cell) => cell.key === "44113:apartment:1")).toMatchObject({
      status: "reportable",
      rent: 1199,
      observations: 17,
      month: "2026-07-01",
    });
    expect(seededClevelandMarketReport.marketRead.cells.find((cell) => cell.key === "44123:apartment:1")).toMatchObject({
      status: "suppressed",
      rent: null,
    });
  });

  it("uses the canonical 999 median for overall product summaries", () => {
    const msaApartment = seededClevelandMarketReport.marketRead.cells.find((cell) => cell.key === "17460:apartment:999");
    expect(msaApartment).toMatchObject({
      geographyType: "msa",
      label: "All apartments",
      rent: 1050,
      observations: 376,
      month: "2026-05-01",
      valueBasis: "trends_median_999",
      status: "reportable",
    });
    expect(msaApartment?.yearOverYearPct).toBeCloseTo(-16, 5);
    expect(new Set(seededClevelandMarketReport.marketRead.cells
      .filter((cell) => cell.geographyType === "city" && cell.bedrooms === 999 && cell.status === "reportable")
      .map((cell) => cell.geographyLabel)).size).toBe(8);
  });

  it("provides a useful supported ZIP field for the analytical map", () => {
    const apartments = seededClevelandMarketReport.marketMap.points.filter((point) => point.propertyType === "apartment" && point.bedrooms === 1 && point.status === "reportable");
    const houses = seededClevelandMarketReport.marketMap.points.filter((point) => point.propertyType === "house" && point.bedrooms === 3 && point.status === "reportable");
    expect(apartments).toHaveLength(10);
    expect(houses).toHaveLength(6);
    expect([...apartments, ...houses].every((point) => point.rent !== null && point.observations >= 10 && point.month === "2026-07-01")).toBe(true);
    expect([...apartments, ...houses].every((point) => point.series.length >= 2)).toBe(true);
    expect([...apartments, ...houses].some((point) => point.series.length === 12)).toBe(true);
    expect(apartments.find((point) => point.zip === "44107")).toMatchObject({ primaryCity: "Lakewood" });
  });

  it("uses a consistent July benchmark definition for the municipality read", () => {
    const cells = seededClevelandMarketReport.marketRead.cells.filter((cell) =>
      cell.geographyType === "city" &&
      cell.status === "reportable" &&
      cell.month === "2026-07-01" &&
      ((cell.propertyType === "apartment" && cell.bedrooms === 1) || (cell.propertyType === "house" && cell.bedrooms === 3))
    );
    expect(cells).toHaveLength(5);
    expect([...new Set(cells.map((cell) => cell.geographyLabel))].sort()).toEqual(["Cleveland", "Lakewood", "Maple Heights"]);
    expect(cells.every((cell) => cell.valueBasis === "trends_value")).toBe(true);
  });

  it("ships a source-dated market activity tape without exposing addresses", () => {
    expect(seededClevelandMarketReport.marketActivity).toMatchObject({ newListings24h: 45, sourceUpdates24h: 396 });
    expect(seededClevelandMarketReport.marketActivity?.events.length).toBeGreaterThan(4);
    expect(JSON.stringify(seededClevelandMarketReport.marketActivity)).not.toMatch(/address|listingId|propertyId/i);
  });

  it("includes current MSA bedroom benchmarks with published Trends trajectories", () => {
    expect(seededClevelandMarketReport.marketRead.cells.find((cell) => cell.key === "17460:apartment:1")).toMatchObject({
      rent: 950,
      yearOverYearPct: 1.39,
      observations: 253,
      month: "2026-07-01",
      valueBasis: "trends_value",
      status: "reportable",
    });
    expect(seededClevelandMarketReport.marketRead.cells.find((cell) => cell.key === "17460:house:3")).toMatchObject({
      rent: 1536,
      yearOverYearPct: 3.27,
      observations: 181,
      month: "2026-07-01",
      valueBasis: "trends_value",
      status: "reportable",
    });
  });
});

describe("Market IQ composer scope and coverage", () => {
  it("uses one selected scope for the preflight and immutable snapshot", () => {
    const scoped = applyMarketIqReportScope(seededClevelandMarketReport, {
      cities: ["Cleveland"],
      zipCodes: ["44113"],
      segments: ["apartment:1"],
    });
    expect(scoped.scope).toMatchObject({ cities: ["Cleveland"], zipCodes: ["44113"], segments: ["1-bedroom apartments"] });
    expect(scoped.marketRead.cells.map((cell) => cell.key)).toEqual(["17460:apartment:1", "Cleveland, OH:apartment:1", "44113:apartment:1"]);
    expect(scoped.marketMap.points).toHaveLength(1);
    expect(buildMarketIqCoveragePreflight(scoped).counts).toEqual({ reportable: 3, thin: 0, stale: 0, unavailable: 0 });
  });

  it("does not silently restore unchecked geographies or segments", () => {
    const selection = normalizeMarketIqScopeSelection({ cities: [], zipCodes: [], segments: [] });
    const scoped = applyMarketIqReportScope(seededClevelandMarketReport, selection);
    expect(scoped.marketRead.cells).toHaveLength(0);
    expect(buildMarketIqCoveragePreflight(scoped).canPublish).toBe(false);
  });

  it("suppresses a selected cell when its Trends month is stale", () => {
    const stale = {
      ...seededClevelandMarketReport,
      marketRead: {
        ...seededClevelandMarketReport.marketRead,
        cells: seededClevelandMarketReport.marketRead.cells.map((cell) => cell.key === "Cleveland, OH:apartment:1" ? { ...cell, month: "2025-01-01" } : cell),
      },
    };
    const scoped = applyMarketIqReportScope(stale, { cities: ["Cleveland"], zipCodes: [], segments: ["apartment:1"] });
    expect(scoped.marketRead.cells.find((cell) => cell.key === "Cleveland, OH:apartment:1")).toMatchObject({ status: "suppressed", rent: null, yearOverYearPct: null });
    expect(buildMarketIqCoveragePreflight(scoped).counts.stale).toBe(1);
  });
});

describe("Market IQ edition comparison", () => {
  it("labels the first published read as a baseline", () => {
    const comparison = compareMarketIqEditions(seededClevelandMarketReport, null);
    expect(comparison).toMatchObject({ state: "baseline", priorReportId: null, findings: [] });
  });

  it("detects a material rent move from the same Trends IQ cell", () => {
    const current = applyMarketIqReportScope(seededClevelandMarketReport, { cities: ["Cleveland"], zipCodes: [], segments: ["apartment:1"] });
    const prior = {
      ...current,
      marketRead: {
        ...current.marketRead,
        cells: current.marketRead.cells.map((cell) => cell.key === "17460:apartment:1" ? { ...cell, rent: 900 } : cell),
      },
    };
    const comparison = compareMarketIqEditions(current, { id: "report_prior", periodLabel: "June 2026", publishedAt: "2026-07-10T00:00:00.000Z", snapshot: prior });
    expect(comparison.state).toBe("changed");
    expect(comparison.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "rent_move", geographyType: "msa", currentValue: 950, priorValue: 900 })]));
  });

  it("does not mislabel a sample threshold change as rent movement", () => {
    const current = applyMarketIqReportScope(seededClevelandMarketReport, { cities: [], zipCodes: ["44113"], segments: ["apartment:1"] });
    const prior = {
      ...current,
      marketRead: {
        ...current.marketRead,
        cells: current.marketRead.cells.map((cell) => cell.key === "44113:apartment:1" ? { ...cell, status: "suppressed" as const, rent: null, yearOverYearPct: null } : cell),
      },
    };
    const comparison = compareMarketIqEditions(current, { id: "report_prior", periodLabel: "June 2026", publishedAt: null, snapshot: prior });
    const zipFinding = comparison.findings.find((finding) => finding.geographyLabel === "ZIP 44113");
    expect(zipFinding).toMatchObject({ kind: "coverage_change" });
    expect(zipFinding?.detail).toContain("not evidence that rent itself moved");
  });

  it("renders the reviewed PM framing and edition state on the client page", () => {
    const report = {
      ...seededClevelandMarketReport,
      editorial: { headline: "Cleveland conditions worth discussing", introduction: "A PM-authored opening for the client.", reviewedAt: "2026-08-14T00:00:00.000Z", reviewedBy: "PM reviewer" },
      editionComparison: compareMarketIqEditions(seededClevelandMarketReport, null),
    };
    const html = renderToStaticMarkup(<MarketIqPublicReport report={report} preview />);
    expect(html).toContain("Cleveland conditions worth discussing");
    expect(html).toContain("A PM-authored opening for the client.");
    expect(html).toContain("Since the last market read");
    expect(html).toContain("This is the launch baseline");
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
