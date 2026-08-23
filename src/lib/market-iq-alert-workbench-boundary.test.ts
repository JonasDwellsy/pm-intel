import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/market-iq/alerts/page.tsx", "utf8");
const actions = readFileSync("src/app/market-iq/alerts/actions.ts", "utf8");
const server = readFileSync("src/lib/market-iq/daily-alert-workbench.server.ts", "utf8");
const countRoute = readFileSync("src/app/api/market-iq/alerts/count/route.ts", "utf8");
const navigation = readFileSync("src/lib/market-iq/navigation.ts", "utf8");

test("the workbench is a persisted cross-market route with no live listing source", () => {
  assert.match(page, /loadMarketIqAlertWorkbench/);
  assert.match(page, /listEntitledMarketIqMarkets/);
  assert.match(server, /marketIqDailyWatchlistMatch\.findMany/);
  assert.match(server, /marketIqDailyWatchlistTriage\.findMany/);
  assert.doesNotMatch(`${page}\n${server}`, /dwellsy-source|listing-events\.server|loadDwellsy/);
});

test("workbench reads stay organization, recipient, entitlement, and visibility scoped", () => {
  assert.match(server, /organizationId: input\.organizationId/);
  assert.match(server, /userId: input\.userId/);
  assert.match(server, /marketId: \{ in: input\.marketIds \}/);
  assert.match(server, /OR: \[\{ userId: input\.userId \}, \{ visibility: "organization" \}\]/);
});

test("bulk updates fail closed before writing shared triage", () => {
  assert.match(actions, /uniqueMatchIds\.length > 100/);
  assert.match(actions, /matches\.length !== uniqueMatchIds\.length/);
  assert.match(actions, /organizationId: context\.organizationId/);
  assert.match(actions, /userId: context\.userId/);
  assert.match(actions, /marketId: \{ in: context\.marketIds \}/);
  assert.match(actions, /organizationMembership\.findUnique/);
  assert.match(actions, /watchlistId_eventKey/);
});

test("the navigation count uses the same authenticated entitlement boundary", () => {
  assert.match(countRoute, /getActiveOrgContext/);
  assert.match(countRoute, /resolveViewerMarketIqAccess/);
  assert.match(countRoute, /listEntitledMarketIqMarkets/);
  assert.match(countRoute, /private, no-store/);
  assert.match(server, /\$queryRaw/);
  assert.match(server, /match\."organizationId" = \$\{input\.organizationId\}/);
  assert.match(server, /match\."userId" = \$\{input\.userId\}/);
  assert.match(server, /Prisma\.join\(input\.marketIds\)/);
  assert.match(navigation, /alerts: "\/market-iq\/alerts"/);
});
