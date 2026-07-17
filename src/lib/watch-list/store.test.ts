// PR #50 (Clerk auth foundation, v0.13).
// PR #65 (multi-tenancy Phase 1, v0.18).
// v0.26 (Task 3, PR pending) — authz reworked onto the pure
// canViewList/canEditList predicates from ./visibility (own list, or
// shared-within-your-org for view; own or legacy-owned-in-your-org
// for edit). See ./visibility.test.ts for the behavioral matrix.
//
// The store delegates authorization-scoping to Prisma's `where`
// clause, which makes the read/write paths impossible to unit-test
// without a real database connection (or a heavyweight Prisma mock
// setup). This file covers only what's testable in isolation:
//
//   - The two well-known owner-id sentinels and the contract they
//     share with the 20260521190000_clerk_owner_id_backfill
//     migration (LEGACY_OWNER_ID was the v0.13 authz key; in v0.18
//     it stays on the row for forensics but no longer drives authz).
//   - The store function signatures — v0.26 requires BOTH userId and
//     organizationId on every read/write, and requires the
//     canViewList/canEditList predicates to actually be consulted
//     (not just organizationId equality). A regression that drops
//     userId, or that re-derives the authz check inline instead of
//     calling the shared predicates, is a tenancy/sharing boundary
//     violation.
//
// Behavioural coverage of cross-org isolation + the own/shared/private
// visibility matrix (getWatchList/updateWatchList/deleteWatchList)
// ships via ./visibility.test.ts (pure predicates) and the manual
// smoke test in the PR plan until we wire a Prisma test database into
// CI.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_OWNER_ID, LEGACY_OWNER_ID } from "./store";

test("LEGACY_OWNER_ID is the stable string the migration targets", () => {
  assert.equal(LEGACY_OWNER_ID, "legacy-pre-auth");
  // No real Clerk userId can collide with this sentinel — they're
  // always prefixed with "user_". Belt-and-suspenders against a
  // future Clerk versioning surprise.
  assert.equal(LEGACY_OWNER_ID.startsWith("user_"), false);
});

test("DEFAULT_OWNER_ID stays distinct from the legacy stamp", () => {
  assert.equal(DEFAULT_OWNER_ID, "shared");
  assert.notEqual(DEFAULT_OWNER_ID, LEGACY_OWNER_ID);
});

test("clerk_owner_id_backfill migration updates 'shared' → LEGACY_OWNER_ID", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260521190000_clerk_owner_id_backfill/migration.sql"
    ),
    "utf8"
  );
  // Migration must reference both sentinels by their exact strings.
  // If LEGACY_OWNER_ID changes, this fails — forcing the migration
  // to be updated in lock-step.
  assert.ok(
    sql.includes(`'${LEGACY_OWNER_ID}'`),
    `migration must set ownerId to '${LEGACY_OWNER_ID}'`
  );
  assert.ok(
    sql.includes(`'${DEFAULT_OWNER_ID}'`),
    `migration must target the legacy '${DEFAULT_OWNER_ID}' rows`
  );
});

test("v0.26 store: read/write signatures require BOTH userId and organizationId", () => {
  // Source-level regression guard. If anyone reverts the v0.26 authz
  // rework and drops userId back off these signatures (reverting to
  // plain organizationId-only scoping), this catches it — that would
  // silently re-introduce the "any org member sees any org list"
  // leak that canViewList/canEditList exist to close.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  // listWatchListes takes (userId, organizationId) — both required.
  assert.ok(
    src.includes("listWatchListes(\n  userId: string,\n  organizationId: string\n)"),
    "listWatchListes must take (userId: string, organizationId: string)"
  );
  // getWatchList/updateWatchList/deleteWatchList all take a
  // WatchListAuthContext ({ userId, organizationId }), not a bare
  // organizationId string.
  assert.ok(
    src.match(/getWatchList\(\s*id: string,\s*ctx: WatchListAuthContext/),
    "getWatchList must accept a WatchListAuthContext (userId + organizationId), not a bare organizationId"
  );
  assert.ok(
    /updateWatchList\([\s\S]*?ctx: WatchListAuthContext/.test(src),
    "updateWatchList must accept a WatchListAuthContext"
  );
  assert.ok(
    /deleteWatchList\(\s*id: string,\s*ctx: WatchListAuthContext/.test(src),
    "deleteWatchList must accept a WatchListAuthContext"
  );
});

test("v0.26 store: reads/writes consult canViewList/canEditList, not raw field comparisons", () => {
  // The v0.18 store compared row.organizationId directly against the
  // caller's organizationId inline. v0.26 delegates that decision to
  // the shared predicates in ./visibility so the view/edit rules live
  // in exactly one place. A regression that re-inlines an
  // organizationId-only comparison (bypassing canViewList/canEditList)
  // would silently resurrect the private-list leak Task 2/3 closed.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  assert.ok(
    src.includes('import { canViewList, canEditList } from "./visibility";'),
    "store.ts must import canViewList and canEditList from ./visibility"
  );
  // Every mutation site is gated by canEditList.
  assert.equal(
    (src.match(/canEditList\(/g) ?? []).length >= 2,
    true,
    "updateWatchList and deleteWatchList must both call canEditList"
  );
  // Every read site is gated by canViewList.
  assert.equal(
    (src.match(/canViewList\(/g) ?? []).length >= 3,
    true,
    "listWatchListes, getWatchList, and getWatchListWithCrossOrgCheck must all call canViewList"
  );
});

test("v0.26 store: getWatchListWithCrossOrgCheck gates the same-org happy path on canViewList", () => {
  // SECURITY: Task 3's headline fix. Before, any row whose
  // organizationId matched the caller's active org was unconditionally
  // "found" — including a teammate's PRIVATE (isShared: false) list.
  // The happy-path branch must now also fail closed via canViewList
  // before returning "found".
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  assert.ok(
    /row\.organizationId === activeOrganizationId\) \{[\s\S]{0,300}?canViewList\(record, \{ userId, organizationId: activeOrganizationId \}\)[\s\S]{0,120}?status: "not_found"/.test(
      src
    ),
    'getWatchListWithCrossOrgCheck must return { status: "not_found" } when the row is in the active org but canViewList fails (teammate\'s private list)'
  );
});

test("v0.26 store: createWatchList requires organizationId in input", () => {
  // The WatchListInput interface MUST require organizationId so
  // TypeScript catches any caller that forgets to thread it through.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  // Match the WatchListInput shape — organizationId must be a
  // required (non-optional) field.
  const ifaceMatch = src.match(
    /export interface WatchListInput \{[\s\S]*?\n\}/
  );
  assert.ok(ifaceMatch, "WatchListInput interface must exist");
  const iface = ifaceMatch![0];
  // Required field — no `?` after the name.
  assert.ok(
    /organizationId:\s*string;/.test(iface),
    "WatchListInput.organizationId must be required (no `?` modifier)"
  );
});
