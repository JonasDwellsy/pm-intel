// PR #50 (Clerk auth foundation, v0.13) — expanded in v0.21 for the
// first-paying-customer launch (PR #101).
//
// Verifies that the path patterns the middleware uses to decide
// which routes need an authenticated Clerk session resolve correctly
// against the actual URL shapes our pages and API handlers expose.
//
// Coverage focuses on:
//
//   - Discovery-path invariants:
//     - /watch-lists/new (template picker) is PUBLIC
//     - /watch-lists, /watch-lists/:id/* (saved work) are PROTECTED
//     - /api/watch-lists/preview is PUBLIC; CRUD is PROTECTED
//
//   - v0.21 premium-content boundary:
//     - Marketing wedge — home, state + market LANDING pages,
//       /methodology, the /briefs index, and the national brief
//       (/briefs/national) — stays PUBLIC
//     - Per-operator scorecards + operator profiles + /ask + the
//       data APIs that back them are PROTECTED
//     - Per-market briefs (/property-managers/:state/:city/brief)
//       are PROTECTED too, as of the brief-gating change (commit
//       7f8291d): they fall through to the :slug pattern; the
//       national brief is the free public sample
//
// We compile the path patterns with path-to-regexp directly — same
// library Clerk's createRouteMatcher uses internally — so the test
// exercises the same syntax the middleware does without dragging in
// Next.js runtime types.

import test from "node:test";
import { strict as assert } from "node:assert";
import { pathToRegexp } from "path-to-regexp";
import {
  PROTECTED_ROUTE_PATTERNS,
  PUBLIC_BUYBOX_PATTERNS,
} from "./protected-routes";

function matchesAny(patterns: readonly string[], pathname: string): boolean {
  for (const pattern of patterns) {
    const re = pathToRegexp(pattern);
    if (re.test(pathname)) return true;
  }
  return false;
}

function isGated(pathname: string): boolean {
  // Mirror the composition in middleware.ts: a route is gated when
  // it matches the protected list AND not the public carve-outs.
  return (
    matchesAny(PROTECTED_ROUTE_PATTERNS, pathname) &&
    !matchesAny(PUBLIC_BUYBOX_PATTERNS, pathname)
  );
}

// --- Watch-list discovery + workspace (existing coverage) ---

test("anonymous users can hit /watch-lists/new (template picker)", () => {
  assert.equal(isGated("/watch-lists/new"), false);
});

test("anonymous users are gated off /watch-lists (saved list)", () => {
  assert.equal(isGated("/watch-lists"), true);
});

test("Market IQ preview routes require a Clerk session", () => {
  assert.equal(isGated("/market-iq"), true);
  assert.equal(isGated("/market-iq/welcome"), false);
  assert.equal(isGated("/market-iq/markets/cleveland-elyria-mentor-oh"), true);
  assert.equal(isGated("/api/market-iq/watchlists"), true);
});

test("Portfolio IQ owner workspace requires a Clerk session", () => {
  assert.equal(isGated("/portfolio-iq"), true);
  assert.equal(isGated("/portfolio-iq/team"), true);
  assert.equal(isGated("/portfolio-iq/properties/acadian-apartments"), true);
  assert.equal(isGated("/onboarding"), true);
});

test("Market IQ ingestion bypasses Clerk only for bearer-token auth routes", () => {
  assert.equal(isGated("/api/market-iq/import/history"), false);
  assert.equal(isGated("/api/market-iq/import/trends"), false);
  assert.equal(isGated("/api/market-iq/source/dwellsy/refresh"), false);
  assert.equal(isGated("/api/market-iq/source/trends/refresh"), false);
  assert.equal(isGated("/api/market-iq/source-snapshots"), false);
  assert.equal(isGated("/api/market-iq/watchlists"), true);
});

test("Stripe webhook bypasses Clerk while customer billing routes remain protected", () => {
  assert.equal(isGated("/api/market-iq/billing/webhook"), false);
  assert.equal(isGated("/api/market-iq/billing/checkout"), true);
  assert.equal(isGated("/api/market-iq/billing/portal"), true);
});

test("anonymous users are gated off /watch-lists/:id/edit", () => {
  assert.equal(isGated("/watch-lists/cuid_abc123/edit"), true);
});

test("anonymous users are gated off /watch-lists/:id/results", () => {
  assert.equal(isGated("/watch-lists/cuid_abc123/results"), true);
});

test("anonymous users are gated off /watch-lists/:id/changes (v0.16 change-detection detail view)", () => {
  assert.equal(isGated("/watch-lists/cuid_abc123/changes"), true);
});

test("anonymous users CAN hit the preview API for in-memory drafts", () => {
  assert.equal(isGated("/api/watch-lists/preview"), false);
});

test("anonymous users are gated off /api/watch-lists (CRUD list/create)", () => {
  assert.equal(isGated("/api/watch-lists"), true);
});

test("anonymous users are gated off /api/watch-lists/:id (CRUD by id)", () => {
  assert.equal(isGated("/api/watch-lists/cuid_abc123"), true);
});

// --- v0.21 premium-content boundary ---

test("v0.21: marketing surface pages stay public", () => {
  for (const path of [
    "/",
    "/methodology",
    "/methodology/portfolio-estimator",
    "/property-managers",
    "/property-managers/texas",
    "/property-managers/texas/dallas-fort-worth",
    "/briefs",
    "/briefs/national",
    "/claim",
    "/claim/mayflower",
    "/sign-in",
    "/sign-up",
  ]) {
    assert.equal(isGated(path), false, `expected ${path} to be public`);
  }
});

test("v0.21: per-operator scorecards are gated (premium content)", () => {
  assert.equal(
    isGated("/property-managers/texas/dallas-fort-worth/mayflower"),
    true
  );
});

test("v0.21: operator compare subpage is gated", () => {
  assert.equal(
    isGated("/property-managers/texas/dallas-fort-worth/mayflower/compare"),
    true
  );
});

test("v0.21: operator OG image route is gated (no preview leaks for premium content)", () => {
  // Next.js auto-generates a route at .../opengraph-image from the
  // opengraph-image.tsx file convention. The :path* wildcard catches
  // it so social-unfurl scrapers can't pull the rendered preview
  // for a gated scorecard.
  assert.equal(
    isGated(
      "/property-managers/texas/dallas-fort-worth/mayflower/opengraph-image"
    ),
    true
  );
});

test("v0.21: operator profile pages are gated", () => {
  assert.equal(isGated("/operators/invitation-homes"), true);
});

test("v0.21: AI /ask tool is gated", () => {
  assert.equal(isGated("/ask"), true);
});

test("v0.21: /api/ask endpoints are gated", () => {
  assert.equal(isGated("/api/ask"), true);
  assert.equal(isGated("/api/ask/stream"), true);
});

test("v0.21: data APIs backing premium UI are gated", () => {
  assert.equal(isGated("/api/pms/mayflower"), true);
  assert.equal(isGated("/api/markets/dallas-fort-worth-arlington-tx"), true);
  assert.equal(isGated("/api/scorecard/mayflower/pdf"), true);
});

test("per-market briefs are GATED; national brief is the free sample", () => {
  // Brief-gating change (commit 7f8291d): a per-market brief has the
  // same 4-segment shape as a scorecard and now falls through to the
  // protected :slug pattern — the old PUBLIC_BUYBOX carve-out was
  // removed — so it requires sign-in. The /briefs index (teaser) and
  // the national brief (/briefs/national, the free sample) stay
  // public.
  assert.equal(
    isGated("/property-managers/tennessee/chattanooga/brief"),
    true
  );
  assert.equal(isGated("/briefs"), false);
  assert.equal(isGated("/briefs/national"), false);
});
