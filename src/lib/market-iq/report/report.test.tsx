import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMarketIqReportSnapshot,
  parseMarketIqReportSnapshot,
  type MarketIqPortfolioObservation,
} from "./report";

function observations(input: {
  prefix: string;
  count: number;
  rent: number;
  portfolio: boolean;
  submarket?: string;
  properties?: number;
}): MarketIqPortfolioObservation[] {
  return Array.from({ length: input.count }, (_, index) => ({
    id: `${input.prefix}-${index}`,
    propertyKey: `${input.prefix}-property-${index % (input.properties ?? 6)}`,
    propertyType: "apartment",
    bedrooms: 1,
    postalCode: "44114",
    submarket: input.submarket ?? "Downtown",
    askingRent: input.rent,
    inPortfolio: input.portfolio,
  }));
}

const baseInput = {
  generatedAt: new Date("2026-08-14T00:00:00.000Z"),
  brand: {
    displayName: "Test Residential",
    logoUrl: null,
    primaryColor: "#123456",
    accentColor: "#987654",
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    websiteUrl: null,
  },
  scope: {
    marketId: "cleveland",
    marketName: "Cleveland–Elyria, OH",
    portfolioLabel: "Managed portfolio",
    propertyCount: 2,
    observedUnits: 20,
    observedListings: 20,
    submarkets: ["Downtown"],
    periodStart: "2025-08-01",
    periodEnd: "2026-07-31",
    seededExample: true,
  },
  marketConditions: {
    heading: "Supply increased",
    narrative: "Observed advertised supply increased.",
    trendSegments: [],
    historical: null,
  },
  sources: [{
    name: "Historical export",
    availableThrough: "2026-07-31",
    observationCount: 100,
    note: "Observed asking listings.",
  }],
};

describe("Market IQ owner report assembly", () => {
  it("builds a portfolio-first comparison when both samples are defensible", () => {
    const report = buildMarketIqReportSnapshot({
      ...baseInput,
      observations: [
        ...observations({ prefix: "portfolio", count: 20, rent: 1_200, portfolio: true, properties: 2 }),
        ...observations({ prefix: "market", count: 40, rent: 1_000, portfolio: false, properties: 8 }),
      ],
    });

    expect(report.portfolioPosition.portfolioWide).toHaveLength(1);
    expect(report.portfolioPosition.portfolioWide[0]).toMatchObject({ status: "reportable", positionPct: 20 });
    expect(report.portfolioPosition.submarkets).toHaveLength(1);
    expect(report.portfolioPosition.narrative).toMatch(/advertised-rent positioning/i);
  });

  it("suppresses a comparison when the external market sample is thin", () => {
    const report = buildMarketIqReportSnapshot({
      ...baseInput,
      observations: [
        ...observations({ prefix: "portfolio", count: 20, rent: 1_200, portfolio: true, properties: 2 }),
        ...observations({ prefix: "market", count: 29, rent: 1_000, portfolio: false, properties: 8 }),
      ],
    });

    expect(report.portfolioPosition.portfolioWide[0]).toMatchObject({
      status: "suppressed",
      positionPct: null,
      portfolio: { medianAskingRent: null },
      market: { medianAskingRent: null },
    });
    expect(report.portfolioPosition.portfolioWide[0].suppressionReason).toMatch(/30 market observations/);
  });

  it("parses only supported immutable report snapshots", () => {
    const report = buildMarketIqReportSnapshot({
      ...baseInput,
      observations: [
        ...observations({ prefix: "portfolio", count: 20, rent: 1_200, portfolio: true }),
        ...observations({ prefix: "market", count: 40, rent: 1_000, portfolio: false }),
      ],
    });
    expect(parseMarketIqReportSnapshot(JSON.stringify(report))).toEqual(report);
    expect(parseMarketIqReportSnapshot('{"version":999}')).toBeNull();
    expect(parseMarketIqReportSnapshot("not json")).toBeNull();
  });
});

describe("Market IQ report migration", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync("prisma/migrations/20260814070000_market_iq_reports/migration.sql", "utf8");

  it("adds the isolated report workflow models and relations", () => {
    for (const model of [
      "OrganizationBrandProfile",
      "MarketIqReport",
      "MarketIqReportRecipient",
      "MarketIqReportSend",
    ]) {
      expect(schema).toMatch(new RegExp(`model ${model} \\{`));
      expect(migration).toMatch(new RegExp(`CREATE TABLE "${model}"`));
    }
    expect(schema).toMatch(/marketIqReports\s+MarketIqReport\[\]/);
    expect(schema).toMatch(/marketIqReportSends\s+MarketIqReportSend\[\]/);
  });

  it("contains no destructive statements", () => {
    expect(migration).not.toMatch(/^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  });
});
