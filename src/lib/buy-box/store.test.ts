// PR #50 (Clerk auth foundation, v0.13).
//
// The store delegates owner-scoping to Prisma's `where` clause, which
// makes the read/write paths impossible to unit-test without a real
// database connection (or a heavyweight Prisma mock setup). This
// test file covers only what's testable in isolation: the two
// well-known owner-id sentinels and the contract they share with the
// 20260521190000_clerk_owner_id_backfill migration. If anyone renames
// LEGACY_OWNER_ID without updating the migration SQL (or vice versa),
// existing pre-auth rows would silently stop being addressable —
// these assertions catch that drift.
//
// Behavioural coverage of getBuyBox/updateBuyBox/deleteBuyBox
// owner-scoping ships via the manual smoke test in the PR plan
// (cross-user read attempts return 404) until we wire a Prisma test
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
