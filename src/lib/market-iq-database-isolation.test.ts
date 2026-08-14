import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ANALYTICAL_DELEGATES = [
  "marketIqDataImport",
  "marketIqListing",
  "marketIqTrendObservation",
  "marketIqAlert",
  "marketIqSourceRefresh",
  "marketIqSourceRefreshItem",
  "marketIqListingFeedRun",
  "marketIqLiveListingSnapshot",
  "marketIqListingEvent",
] as const;

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const file = path.join(root, entry);
    if (file === path.join("src", "generated")) return [];
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts") ? [file] : [];
  });
}

test("Market IQ analytical delegates never use the primary Prisma client", () => {
  const violations = sourceFiles("src").flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return ANALYTICAL_DELEGATES.flatMap((delegate) =>
      source.includes(`prisma.${delegate}`) ? [`${file}: prisma.${delegate}`] : []
    );
  });
  assert.deepEqual(violations, []);
});

test("the analytical schema contains no customer, operator, or portfolio models", () => {
  const schema = readFileSync("prisma/market-iq/schema.prisma", "utf8");
  assert.match(schema, /env\("MARKET_IQ_DATABASE_URL"\)/);
  assert.match(schema, /model MarketIqDataImport/);
  assert.match(schema, /model MarketIqListing/);
  assert.match(schema, /model MarketIqListingFeedRun/);
  assert.doesNotMatch(schema, /model Organization\b/);
  assert.doesNotMatch(schema, /model PM\b/);
  assert.doesNotMatch(schema, /model PortfolioIq/);
  assert.doesNotMatch(schema, /model MarketIqWatchlist/);
});

test("Market IQ database configuration fails closed without a primary URL fallback", () => {
  const client = readFileSync("src/lib/market-iq/prisma.ts", "utf8");
  assert.match(client, /MARKET_IQ_DATABASE_URL/);
  assert.doesNotMatch(client, /process\.env\.DATABASE_URL/);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.match(packageJson.scripts["vercel-build"], /prisma\/market-iq\/schema\.prisma/);
  assert.match(packageJson.scripts["vercel-build"], /deploy-market-iq-migrations/);
});

test("customer watchlists remain organization-scoped in the primary database", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const model = schema.slice(
    schema.indexOf("model MarketIqWatchlist"),
    schema.indexOf("model MarketIqDataImport")
  );
  assert.match(model, /organization Organization @relation/);
  assert.match(model, /@@index\(\[organizationId/);
});
