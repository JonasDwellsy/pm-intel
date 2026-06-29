// v0.22 — input/output tests for the pure market-entitlement logic.
// Like email-domain.test.ts, these are real behavior tests (the
// functions are pure — no Prisma/Clerk). The async DB/auth wrappers
// live in market-entitlements.server.ts and are covered by the
// source-level + migration tests below.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_MARKETS,
  computeEntitlement,
  isMarketEntitled,
  filterToEntitled,
} from "./market-entitlements";

// ─── computeEntitlement ──────────────────────────────────────────

test("computeEntitlement — admin always resolves to ALL (bypass)", () => {
  // Internal admins see everything regardless of org flags/grants.
  assert.equal(
    computeEntitlement({ isAdmin: true, allMarkets: false, grantedMarketIds: [] }),
    ALL_MARKETS
  );
  assert.equal(
    computeEntitlement({ isAdmin: true, allMarkets: false, grantedMarketIds: ["x"] }),
    ALL_MARKETS
  );
});

test("computeEntitlement — allMarkets flag resolves to ALL", () => {
  assert.equal(
    computeEntitlement({ isAdmin: false, allMarkets: true, grantedMarketIds: [] }),
    ALL_MARKETS
  );
});

test("computeEntitlement — explicit grants resolve to that set", () => {
  const ent = computeEntitlement({
    isAdmin: false,
    allMarkets: false,
    grantedMarketIds: ["chattanooga-tn", "phoenix-az"],
  });
  assert.notEqual(ent, ALL_MARKETS);
  assert.ok(ent instanceof Set);
  assert.equal((ent as Set<string>).size, 2);
  assert.ok((ent as Set<string>).has("chattanooga-tn"));
  assert.ok((ent as Set<string>).has("phoenix-az"));
});

test("computeEntitlement — no flag + no grants = empty set (FAIL-CLOSED)", () => {
  const ent = computeEntitlement({
    isAdmin: false,
    allMarkets: false,
    grantedMarketIds: [],
  });
  assert.notEqual(ent, ALL_MARKETS);
  assert.ok(ent instanceof Set);
  assert.equal((ent as Set<string>).size, 0);
});

// ─── isMarketEntitled ────────────────────────────────────────────

test("isMarketEntitled — ALL grants every market", () => {
  assert.equal(isMarketEntitled(ALL_MARKETS, "anything"), true);
  assert.equal(isMarketEntitled(ALL_MARKETS, "richmond-va"), true);
});

test("isMarketEntitled — set grants only its members", () => {
  const ent = new Set(["phoenix-az"]);
  assert.equal(isMarketEntitled(ent, "phoenix-az"), true);
  assert.equal(isMarketEntitled(ent, "richmond-va"), false);
});

test("isMarketEntitled — empty set grants nothing (fail-closed)", () => {
  const ent = new Set<string>();
  assert.equal(isMarketEntitled(ent, "phoenix-az"), false);
});

// ─── filterToEntitled ────────────────────────────────────────────

test("filterToEntitled — ALL returns every input id, order preserved", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(filterToEntitled(ALL_MARKETS, ids), ["a", "b", "c"]);
});

test("filterToEntitled — set returns the intersection, input order preserved", () => {
  const ent = new Set(["b", "d"]);
  assert.deepEqual(filterToEntitled(ent, ["a", "b", "c", "d"]), ["b", "d"]);
});

test("filterToEntitled — empty set returns nothing", () => {
  assert.deepEqual(filterToEntitled(new Set<string>(), ["a", "b"]), []);
});

// ─── server wrapper + migration contracts (source-level) ─────────

test("market-entitlements.server resolves admin bypass + active org", () => {
  // Source-level guard (the wrapper needs a real Clerk session + DB to
  // run): the server resolver must apply the admin bypass and route
  // non-admins through their active org's entitlement.
  const src = readFileSync(
    join(process.cwd(), "src/lib/auth/market-entitlements.server.ts"),
    "utf8"
  );
  assert.ok(src.includes('import "server-only"'), "must be server-only");
  assert.ok(
    src.includes("isAdminUser"),
    "resolveViewerEntitlement must apply the admin bypass"
  );
  assert.ok(
    src.includes("getActiveOrgContext") || src.includes("getActiveOrgId"),
    "must resolve the viewer's active org"
  );
  assert.ok(
    src.includes("computeEntitlement"),
    "server wrapper must delegate to the pure computeEntitlement"
  );
});

test("market_entitlements migration adds flag + grant table + backfill", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260629000000_market_entitlements/migration.sql"
    ),
    "utf8"
  );
  assert.ok(
    /ALTER TABLE "Organization" ADD COLUMN "allMarkets" BOOLEAN NOT NULL DEFAULT false/.test(
      sql
    ),
    "must add allMarkets defaulting to false (fail-closed for new orgs)"
  );
  assert.ok(
    /UPDATE "Organization" SET "allMarkets" = true/.test(sql),
    "must backfill existing orgs to allMarkets=true so nobody goes dark"
  );
  assert.ok(
    /CREATE TABLE "OrganizationMarketAccess"/.test(sql),
    "must create the per-market grant table"
  );
  assert.ok(
    /"OrganizationMarketAccess_organizationId_marketId_key"/.test(sql),
    "grant rows must be unique per (org, market)"
  );
});
