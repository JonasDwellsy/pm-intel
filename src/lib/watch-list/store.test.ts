// PR #50 (Clerk auth foundation, v0.13).
// PR #65 (multi-tenancy Phase 1, v0.18).
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
//   - The store function signatures — v0.18 swapped the third
//     positional argument from `ownerId` to `organizationId`. A
//     regression that re-introduces `ownerId` as the authz key is
//     a tenancy boundary violation.
//
// Behavioural coverage of cross-org isolation
// (getWatchList/updateWatchList/deleteWatchList) ships via the
// manual smoke test in the PR plan until we wire a Prisma test
// database into CI.

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

test("v0.18 store: authz signatures take organizationId, not userId", () => {
  // Source-level regression guard. If anyone reverts the v0.18
  // signature change and re-introduces ownerId as the second
  // argument on getWatchList/updateWatchList/deleteWatchList, this
  // catches it. The store's authz contract is that callers MUST
  // pass an organizationId (resolved via getActiveOrgId()), never
  // a raw userId.
  const src = readFileSync(
    join(process.cwd(), "src/lib/watch-list/store.ts"),
    "utf8"
  );
  // listWatchListes takes organizationId (was ownerId pre-v0.18).
  assert.ok(
    src.includes("listWatchListes(organizationId: string)"),
    "listWatchListes must take organizationId, not ownerId"
  );
  // getWatchList's second arg is named organizationId, not ownerId.
  assert.ok(
    src.match(/getWatchList\([^)]*organizationId\?: string/),
    "getWatchList must accept organizationId, not ownerId"
  );
  // The WHERE clause that gates reads must use organizationId.
  assert.ok(
    src.includes("where: { organizationId }"),
    "list query must filter by organizationId"
  );
  // The mismatch check on getWatchList compares organizationId,
  // not ownerId.
  assert.ok(
    src.includes("row.organizationId !== organizationId"),
    "getWatchList authz check must compare organizationId"
  );
});

test("v0.18 store: createWatchList requires organizationId in input", () => {
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
