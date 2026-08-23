import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCurrentMonthUnavailableCuts, buildDwellsyPropertyUrl, buildMarketIqReportSnapshot, formatMarketIqListingAddress, isPublicMarketIqReportStatus, MARKET_IQ_DAILY_ACTIVITY_CONTRACT_VERSION, MARKET_IQ_SNAPSHOT_CONTRACT_VERSION, MARKET_IQ_TRENDS_HISTORY_MONTHS, parseCurrentMarketIqReportSourceSnapshot, parseMarketIqReportSnapshot, trendHistoryQueryStart, trendHistoryWindowStart } from "./report";
import { canAccessMarketIqReportComposer } from "./access";
import { buildMarketIqReportEmail } from "./email";
import { parseMarketIqEditorialDefaultsForm } from "./form-values";
import { compareMarketIqEditions } from "./edition-comparison";
import { seededClevelandMarketReport } from "./seeded-cleveland";
import { applyMarketIqReportScope, buildMarketIqCoveragePreflight, defaultMarketIqScopeSelection, marketIqScopeOptions, normalizeMarketIqScopeSelection } from "./scope";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";

const baseInput = {
  generatedAt: new Date("2026-08-14T00:00:00.000Z"),
  brand: { displayName: "Test Residential", logoUrl: null, primaryColor: "#123456", accentColor: "#987654", contactName: null, contactEmail: null, contactPhone: null, websiteUrl: null },
  scope: { marketId: "cleveland", marketName: "Cleveland-Elyria, OH", cities: ["Cleveland"], zipCodes: ["44114"], segments: ["Apartments by bedroom"], periodStart: "2025-08-01", periodEnd: "2026-07-31", seededExample: true },
  marketConditions: { heading: "Supply increased", narrative: "Observed advertised supply increased.", historical: null },
  sources: [{ name: "Total IQ", availableThrough: "2026-07-31", observationCount: 100, note: "Observed asking listings." }],
};

describe("Market IQ local market read assembly", () => {
  it("uses property identifiers for Dwellsy links and formats source street addresses", () => {
    expect(buildDwellsyPropertyUrl(21_028_706)).toBe("https://dwellsy.com/details/21028706");
    expect(buildDwellsyPropertyUrl("not-an-id")).toBeNull();
    expect(formatMarketIqListingAddress(["3567 Bosworth Rd", "Apt 2", null])).toBe("3567 Bosworth Rd, Apt 2");
    const adapter = readFileSync("src/lib/dwellsy-source/listing-events.server.ts", "utf8");
    expect(adapter).toContain("listing.property_id");
    expect(adapter).toContain("buildDwellsyPropertyUrl(row.property_id)");
    expect(adapter).not.toContain("details/${listingId}");
    expect(adapter).toContain("const MAX_SAVED_ACTIVITY_EVENTS = 200");
    expect(adapter).toContain("NOW() - INTERVAL '24 hours'");
    expect(adapter).toContain("COUNT(DISTINCT listing.listing_id) >= 25");
    expect(adapter).toContain("eventsTruncated: reportableEvents.length > MAX_SAVED_ACTIVITY_EVENTS");
  });

  it("requests enough history and publishes an exact trailing 36-month window", () => {
    expect(trendHistoryQueryStart(new Date("2026-08-20T12:00:00Z"))).toBe("2022-08-01");
    expect(trendHistoryWindowStart("2026-07-01")).toBe("2023-08-01");
    const points = Array.from({ length: 40 }, (_, index) => ({
      rent: 900 + index,
      yearOverYearPct: 1,
      observations: 20,
      month: new Date(Date.UTC(2023, 3 + index, 1)).toISOString().slice(0, 10),
    }));
    const report = buildMarketIqReportSnapshot({
      ...baseInput,
      trendSeries: [{ geographyType: "msa", geographyValue: "17460", geographyLabel: "Cleveland-Elyria, OH", propertyType: "apartment", bedrooms: 1, points }],
    });
    expect(report.dataContract).toEqual({
      version: MARKET_IQ_SNAPSHOT_CONTRACT_VERSION,
      trendsHistoryMonths: MARKET_IQ_TRENDS_HISTORY_MONTHS,
      dailyActivityVersion: MARKET_IQ_DAILY_ACTIVITY_CONTRACT_VERSION,
    });
    expect(report.marketRead.cells[0]?.series).toHaveLength(36);
    expect(report.marketRead.cells[0]?.series[0]?.month).toBe("2023-08-01");
    expect(report.marketRead.cells[0]?.series.at(-1)?.month).toBe("2026-07-01");
  });

  it("records every standard cut missing from the current source month without inventing a cause", () => {
    const current = (geographyType: "msa" | "city", geographyValue: string, propertyType: "apartment" | "house", bedrooms: number, month: string) => ({
      geographyType,
      geographyValue,
      geographyLabel: geographyType === "msa" ? "Cleveland-Elyria, OH" : "Cleveland",
      propertyType,
      bedrooms,
      points: [{ rent: 1_000, yearOverYearPct: 1, observations: 10, month }],
    });
    const segments = [
      { propertyType: "apartment" as const, bedrooms: 0 },
      { propertyType: "apartment" as const, bedrooms: 1 },
      { propertyType: "apartment" as const, bedrooms: 2 },
      { propertyType: "house" as const, bedrooms: 2 },
      { propertyType: "house" as const, bedrooms: 3 },
      { propertyType: "house" as const, bedrooms: 4 },
    ];
    const trendSeries = (["msa", "city"] as const).flatMap((geographyType) => segments.map((segment) => current(
      geographyType,
      geographyType === "msa" ? "17460" : "Cleveland, OH",
      segment.propertyType,
      segment.bedrooms,
      (segment.bedrooms === 1 || segment.bedrooms === 3) ? "2026-07-01" : "2026-06-01",
    )));

    const unavailable = buildCurrentMonthUnavailableCuts({
      trendSeries,
      currentMonth: "2026-07-01",
      geographies: [
        { geographyType: "msa", geographyValue: "17460", label: "Cleveland-Elyria MSA" },
        { geographyType: "city", geographyValue: "Cleveland, OH", label: "Cleveland city" },
      ],
      segments,
    });

    expect(unavailable.map((cut) => cut.label)).toEqual([
      "Studio apartments · July 2026",
      "2-bedroom apartments · July 2026",
      "2-bedroom houses · July 2026",
      "4-bedroom houses · July 2026",
    ]);
    expect(unavailable.every((cut) => cut.reason === "Dwellsy IQ Trends did not publish a July 2026 value for Cleveland-Elyria MSA or Cleveland city. The latest available evidence for the missing locations is June 2026.")).toBe(true);
    expect(JSON.stringify(unavailable)).not.toMatch(/threshold|suppression|maturity|coverage change/i);
  });

  it("renders unavailable source cuts in the internal market workspace", () => {
    const source = readFileSync("src/components/market-iq/MarketIqIntelligenceWorkspace.tsx", "utf8");
    expect(source).toContain("report.marketRead.unavailableCuts.map");
    expect(source).toContain("What the latest source month did not publish");
  });

  it("distinguishes blended market trajectories from bedroom-specific series", () => {
    const source = readFileSync("src/components/market-iq/MarketIqIntelligenceWorkspace.tsx", "utf8");
    expect(source).toContain("cell.bedrooms === 999");
    expect(source).toContain("Blended market mix");
    expect(source).toContain("Bedroom-specific series");
    expect(source).toContain("All bedroom counts and price tiers");
    expect(source).toContain("One bedroom-count segment");
    expect(source).toContain("Market-level asking rents can move");
    expect(source).toContain("does not translate directly into rent movement for a comparable home");
    expect(source).not.toContain("Each chart uses up to 36 monthly Trends observations");
  });

  it("derives edition geography from the selected market instead of Cleveland constants", () => {
    const report = buildMarketIqReportSnapshot({
      ...baseInput,
      scope: {
        ...baseInput.scope,
        marketId: "san-jose-sunnyvale-santa-clara-ca",
        marketName: "San Jose–Sunnyvale–Santa Clara, CA MSA",
        cities: ["San Jose"],
        zipCodes: ["95112"],
      },
      trendSeries: [
        { geographyType: "city", geographyValue: "San Jose, CA", geographyLabel: "San Jose", propertyType: "apartment", bedrooms: 1, points: [{ rent: 2_700, yearOverYearPct: 1.8, observations: 10, month: "2026-07-01" }] },
        { geographyType: "zip", geographyValue: "95112", geographyLabel: "ZIP 95112", propertyType: "apartment", bedrooms: 1, points: [{ rent: 2_650, yearOverYearPct: 1.2, observations: 8, month: "2026-07-01" }] },
      ],
      mapCenters: { "95112": { latitude: 37.344, longitude: -121.884 } },
    });
    expect(marketIqScopeOptions(report)).toMatchObject({ cities: ["San Jose"], zipCodes: ["95112"] });
    const scoped = applyMarketIqReportScope(report, { cities: ["San Jose"], zipCodes: ["95112"], segments: ["apartment:1"] });
    expect(scoped.scope.marketId).toBe("san-jose-sunnyvale-santa-clara-ca");
    expect(scoped.marketRead.cells.map((cell) => cell.geographyValue)).toEqual(["San Jose, CA", "95112"]);
    expect(scoped.marketMap.points.map((point) => point.zip)).toEqual(["95112"]);
  });

  it("publishes a defensible market cell with level, trajectory, sample, and date", () => {
    const report = buildMarketIqReportSnapshot({ ...baseInput, trendSeries: [{ geographyType: "city", geographyValue: "Cleveland, OH", geographyLabel: "Cleveland", propertyType: "apartment", bedrooms: 1, points: [{ rent: 1_025, yearOverYearPct: 2.5, observations: 20, month: "2026-07-01" }] }] });
    expect(report.marketRead.cells).toHaveLength(1);
    expect(report.marketRead.cells[0]).toMatchObject({ status: "reportable", rent: 1_025, yearOverYearPct: 2.5, observations: 20, month: "2026-07-01" });
    expect(report.methodNote).toMatch(/Every published rent input comes from Trends IQ/);
    expect(JSON.stringify(report)).not.toMatch(/portfolioPosition|positionPct|competitor/i);
  });

  it("publishes every Trends IQ value without applying another unit-count threshold", () => {
    const report = buildMarketIqReportSnapshot({ ...baseInput, trendSeries: [{ geographyType: "zip", geographyValue: "44114", geographyLabel: "ZIP 44114", propertyType: "apartment", bedrooms: 1, points: [{ rent: 1_025, yearOverYearPct: 2.5, observations: 9, month: "2026-07-01" }] }], mapCenters: { "44114": { latitude: 41.5, longitude: -81.67 } } });
    expect(report.marketRead.cells[0]).toMatchObject({ status: "reportable", rent: 1_025, yearOverYearPct: 2.5, observations: 9 });
    expect(report.marketRead.cells[0].suppressionReason).toBeNull();
    expect(report.marketMap.points[0]).toMatchObject({ zip: "44114", status: "reportable", rent: 1_025 });
  });

  it("parses only snapshots produced under the current analytical contract", () => {
    const authoritative = {
      ...seededClevelandMarketReport,
      scope: { ...seededClevelandMarketReport.scope, seededExample: false },
    };
    expect(parseMarketIqReportSnapshot(JSON.stringify(authoritative))).toEqual(authoritative);
    expect(parseCurrentMarketIqReportSourceSnapshot(JSON.stringify(authoritative))).toEqual(authoritative);
    expect(parseCurrentMarketIqReportSourceSnapshot(JSON.stringify({
      ...authoritative,
      dataContract: { ...authoritative.dataContract, trendsHistoryMonths: 14 },
    }))).toBeNull();
    expect(parseCurrentMarketIqReportSourceSnapshot(JSON.stringify({
      ...authoritative,
      dataContract: { ...authoritative.dataContract, dailyActivityVersion: 0 },
    }))).toBeNull();
    const priorContract = {
      ...authoritative,
      dataContract: {
        version: 1,
        trendsHistoryMonths: MARKET_IQ_TRENDS_HISTORY_MONTHS,
      },
    };
    expect(parseMarketIqReportSnapshot(JSON.stringify(priorContract))).toEqual(priorContract);
    expect(parseCurrentMarketIqReportSourceSnapshot(JSON.stringify(priorContract))).toBeNull();
    const legacySnapshot: Record<string, unknown> = { ...authoritative };
    delete legacySnapshot.dataContract;
    expect(parseMarketIqReportSnapshot(JSON.stringify(legacySnapshot))).toEqual(legacySnapshot);
    expect(parseCurrentMarketIqReportSourceSnapshot(JSON.stringify(legacySnapshot))).toBeNull();
    expect(parseMarketIqReportSnapshot(JSON.stringify(seededClevelandMarketReport))).toBeNull();
    expect(parseMarketIqReportSnapshot('{"version":1}')).toBeNull();
    expect(parseMarketIqReportSnapshot("not json")).toBeNull();
  });

  it("normalizes source-dated activity from older saved snapshots into the availability contract", () => {
    const legacyActivity = {
      asOf: "2026-08-14T23:00:00.000Z",
      newListings24h: 1,
      sourceUpdates24h: 2,
      confirmedPriceChanges24h: 0,
      advertisedConcessions24h: 0,
      delistings24h: 0,
      agingThresholds24h: 0,
      events: [],
    };
    const parsed = parseMarketIqReportSnapshot(JSON.stringify({
      ...seededClevelandMarketReport,
      scope: { ...seededClevelandMarketReport.scope, seededExample: false },
      marketActivity: legacyActivity,
    }));

    expect(parsed?.marketActivity).toEqual({ state: "available", activity: legacyActivity });
  });

  it("validates and renders selected competitive-set evidence with its observed timestamp", () => {
    const competitiveSetBrief = {
      watchlistId: "watch-1",
      watchlistName: "Atlas competitors",
      marketId: "cleveland-elyria-mentor-oh",
      centerLabel: "The Atlas",
      radiusMiles: 3 as const,
      sourceAsOf: "2026-08-23T09:00:00.000Z",
      windowStartAt: "2026-08-16T09:00:00.000Z",
      windowEndAt: "2026-08-23T09:00:00.000Z",
      coverageDays: 7,
      expectedDays: 7,
      eventsTruncated: false,
      findings: [{ key: "rent_changes:event-1", eventType: "rent_changes" as const, headline: "Asking rent changed at The Atlas", detail: "Asking rent changed from $1,750 to $1,600.", observedAt: "2026-08-23T08:00:00.000Z", propertyId: "subject-1", isSubject: true }],
      disclosure: "Observed listing activity only.",
    };
    const report = {
      ...seededClevelandMarketReport,
      scope: { ...seededClevelandMarketReport.scope, seededExample: false },
      competitiveSetBrief,
    };
    expect(parseMarketIqReportSnapshot(JSON.stringify(report))?.competitiveSetBrief).toEqual(competitiveSetBrief);
    expect(parseMarketIqReportSnapshot(JSON.stringify({ ...report, competitiveSetBrief: { ...competitiveSetBrief, findings: [{ ...competitiveSetBrief.findings[0], observedAt: "not-a-date" }] } }))).toBeNull();
    const html = renderToStaticMarkup(<MarketIqPublicReport report={report} preview />);
    expect(html).toContain("Competitive set evidence");
    expect(html).toContain("Asking rent changed at The Atlas");
    expect(html).toContain("Subject");
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
    expect([...apartments, ...houses].every((point) => point.rent !== null && point.month === "2026-07-01")).toBe(true);
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

  it("does not supply seeded listing events to daily sections", () => {
    expect(seededClevelandMarketReport.marketActivity).toBeUndefined();
    expect(JSON.stringify(seededClevelandMarketReport)).not.toMatch(/seed:new|seed:price/);
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
  it("includes the full Dwellsy Cleveland MSA ZIP universe and every available Census ZCTA", () => {
    const selection = defaultMarketIqScopeSelection();
    const geometry = JSON.parse(readFileSync("public/data/cleveland-zcta.geojson", "utf8"));
    expect(selection.zipCodes).toHaveLength(102);
    expect(geometry.features).toHaveLength(101);
    expect(selection.zipCodes).toEqual(expect.arrayContaining(["44052", "44106", "44130", "44137"]));
    expect(selection.zipCodes).toContain("44061");
  });

  it("uses one selected scope for the preflight and immutable snapshot", () => {
    const scoped = applyMarketIqReportScope(seededClevelandMarketReport, {
      cities: ["Cleveland"],
      zipCodes: ["44113"],
      segments: ["apartment:1"],
    });
    expect(scoped.scope).toMatchObject({ cities: ["Cleveland"], zipCodes: ["44113"], segments: ["1-bedroom apartments"] });
    expect(scoped.marketRead.cells.map((cell) => cell.key)).toEqual(["17460:apartment:1", "Cleveland, OH:apartment:1", "44113:apartment:1"]);
    expect(scoped.marketMap.points).toHaveLength(1);
    expect(buildMarketIqCoveragePreflight(scoped).counts).toEqual({ reportable: 3, stale: 0, unavailable: 0 });
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

  it("does not mislabel a Trends availability change as rent movement", () => {
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
    expect(html).not.toContain("Since the last market read");
    expect(html).not.toContain("This is the launch baseline");
    expect(html).toContain("Market data by Dwellsy IQ");
    expect(html).not.toContain("Trends IQ");
    expect(html).not.toContain("Total IQ");
  });

  it("renders optional PM company marketing only when the reviewed edition includes it", () => {
    const report = {
      ...seededClevelandMarketReport,
      editorial: {
        headline: null,
        introduction: "A message from the property manager.",
        companyProfile: "We manage rental homes across Greater Cleveland for owners who value responsive local service.",
        companyCtaLabel: "Meet our team",
        companyCtaUrl: "https://harborview.example/contact",
        reviewedAt: "2026-08-17T00:00:00.000Z",
        reviewedBy: "PM reviewer",
      },
    };
    const html = renderToStaticMarkup(<MarketIqPublicReport report={report} preview />);
    expect(html).toContain("About Harborview Residential");
    expect(html).toContain("responsive local service");
    expect(html).toContain("Meet our team");
    expect(html).toContain("https://harborview.example/contact");
  });
});

describe("Market IQ report migration", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync("prisma/migrations/20260814070000_market_iq_reports/migration.sql", "utf8");
  const defaultsMigration = readFileSync("prisma/migrations/20260817143000_market_iq_advisory_defaults/migration.sql", "utf8");
  it("adds the isolated report workflow models and relations", () => {
    for (const model of ["OrganizationBrandProfile", "MarketIqReport", "MarketIqReportRecipient", "MarketIqReportSend"]) {
      expect(schema).toMatch(new RegExp(`model ${model} \\{`));
      expect(migration).toMatch(new RegExp(`CREATE TABLE "${model}"`));
    }
    expect(schema).toMatch(/marketIqReports\s+MarketIqReport\[\]/);
    expect(schema).toMatch(/marketIqReportSends\s+MarketIqReportSend\[\]/);
  });
  it("contains no destructive statements", () => { expect(migration).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im); });
  it("adds reusable advisory defaults without destructive statements", () => {
    for (const column of ["defaultClientMessage", "defaultProspectMessage", "companyProfile", "companyCtaLabel", "companyCtaUrl"]) {
      expect(schema).toMatch(new RegExp(`${column}\\s+String\\?`));
      expect(defaultsMigration).toContain(`ADD COLUMN "${column}"`);
    }
    expect(defaultsMigration).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  });
});

describe("Market IQ advisory defaults", () => {
  it("parses separate client and prospect templates with an HTTPS CTA", () => {
    const formData = new FormData();
    formData.set("defaultClientMessage", "A client note");
    formData.set("defaultProspectMessage", "A prospect note");
    formData.set("companyProfile", "A local PM profile");
    formData.set("companyCtaLabel", "Meet the team");
    formData.set("companyCtaUrl", "https://example.com/contact");
    expect(parseMarketIqEditorialDefaultsForm(formData)).toEqual({
      defaultClientMessage: "A client note",
      defaultProspectMessage: "A prospect note",
      companyProfile: "A local PM profile",
      companyCtaLabel: "Meet the team",
      companyCtaUrl: "https://example.com/contact",
    });
  });
  it("rejects a non-HTTPS company CTA", () => {
    const formData = new FormData();
    formData.set("companyCtaUrl", "http://example.com/contact");
    expect(() => parseMarketIqEditorialDefaultsForm(formData)).toThrow(/valid call-to-action address/);
  });
  it("enforces the frozen edition audience again at delivery time", () => {
    const distributionAction = readFileSync("src/app/market-iq/distribution/actions.ts", "utf8");
    expect(distributionAction).toMatch(/editorial\?\.audienceKind/);
    expect(distributionAction).toMatch(/audienceKind !== row\.recipient\.kind/);
  });
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
  it("includes reviewed company marketing in both email formats", () => {
    const report = {
      ...seededClevelandMarketReport,
      editorial: {
        headline: null,
        introduction: "A message from your property manager.",
        companyProfile: "Local management with institutional reporting discipline.",
        companyCtaLabel: "Discuss your portfolio",
        companyCtaUrl: "https://harborview.example/advisory",
        reviewedAt: "2026-08-17T00:00:00.000Z",
        reviewedBy: "PM reviewer",
      },
    };
    const email = buildMarketIqReportEmail({ recipientName: "Avery Owner", recipientKind: "client", report, reportUrl: "https://market.example/report", pdfUrl: "https://market.example/report/pdf" });
    expect(email.html).toContain("About Harborview Residential");
    expect(email.html).toContain("Discuss your portfolio");
    expect(email.text).toContain("Local management with institutional reporting discipline.");
    expect(email.text).toContain("https://harborview.example/advisory");
  });
});
