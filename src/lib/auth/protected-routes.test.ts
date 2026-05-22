// PR #50 (Clerk auth foundation, v0.13).
//
// Verifies that the path patterns the middleware uses to decide
// which routes need an authenticated Clerk session resolve correctly
// against the actual URL shapes our pages and API handlers expose.
//
// Coverage focuses on the discovery-path invariants:
//
//   - /buy-boxes/new (template picker) is PUBLIC so anonymous users
//     can clone a starter buy box without an auth gate (PR #45 path).
//   - /buy-boxes (the saved list) is PROTECTED so anonymous users
//     are bounced to /sign-in.
//   - /api/buy-boxes/preview is PUBLIC so the in-memory preview
//     endpoint stays usable from the anon-friendly editor.
//   - /api/buy-boxes (CRUD) is PROTECTED so saves require a session.
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

test("anonymous users can hit /buy-boxes/new (template picker)", () => {
  assert.equal(isGated("/buy-boxes/new"), false);
});

test("anonymous users are gated off /buy-boxes (saved list)", () => {
  assert.equal(isGated("/buy-boxes"), true);
});

test("anonymous users are gated off /buy-boxes/:id/edit", () => {
  assert.equal(isGated("/buy-boxes/cuid_abc123/edit"), true);
});

test("anonymous users are gated off /buy-boxes/:id/results", () => {
  assert.equal(isGated("/buy-boxes/cuid_abc123/results"), true);
});

test("anonymous users CAN hit the preview API for in-memory drafts", () => {
  assert.equal(isGated("/api/buy-boxes/preview"), false);
});

test("anonymous users are gated off /api/buy-boxes (CRUD list/create)", () => {
  assert.equal(isGated("/api/buy-boxes"), true);
});

test("anonymous users are gated off /api/buy-boxes/:id (CRUD by id)", () => {
  assert.equal(isGated("/api/buy-boxes/cuid_abc123"), true);
});

test("anonymous users are gated off /api/buy-boxes/:id/apply", () => {
  assert.equal(isGated("/api/buy-boxes/cuid_abc123/apply"), true);
});

test("unrelated public routes (home, methodology, operators) are NOT gated", () => {
  for (const path of [
    "/",
    "/methodology",
    "/methodology/portfolio-estimator",
    "/property-managers",
    "/property-managers/nashville-davidson-murfreesboro-franklin-tn",
    "/operators/evernest",
    "/briefs",
    "/sign-in",
    "/sign-up",
  ]) {
    assert.equal(isGated(path), false, `expected ${path} to be public`);
  }
});
