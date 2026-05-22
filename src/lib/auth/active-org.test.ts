// v0.18 (PR #65) — Multi-tenancy Phase 1.
//
// Behavioural tests for getActiveOrgContext / getActiveOrgId live
// in the manual-verification matrix in the PR plan (they require a
// real Postgres + a stubbed Clerk session, which we don't wire up
// in CI). The unit-testable parts here cover the SHAPE of the
// helper's return values + the documented contract that pre-auth
// sentinels in WatchList.ownerId NEVER resolve to a real
// organizationId.
//
// If anyone changes the LEGACY_OWNER_ID constant or the
// personalForUserId @unique-key on Organization without updating
// the helper's lookup query, this catches the drift.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGACY_OWNER_ID, DEFAULT_OWNER_ID } from "../watch-list/store";

test("LEGACY_OWNER_ID stays distinct from any real Clerk userId prefix", () => {
  // Clerk userIds always start with "user_". The sentinel must NOT
  // collide so a query like `personalForUserId: LEGACY_OWNER_ID`
  // never accidentally resolves to a real user's personal org.
  assert.equal(LEGACY_OWNER_ID.startsWith("user_"), false);
  assert.equal(DEFAULT_OWNER_ID.startsWith("user_"), false);
});

test("multi_tenancy_phase_1 migration declares Organization + Membership tables", () => {
  // Belt-and-suspenders: if the migration file gets renamed or
  // edited destructively, this fails loudly.
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260522210000_multi_tenancy_phase_1/migration.sql"
    ),
    "utf8"
  );
  assert.ok(
    sql.includes(`CREATE TABLE "Organization"`),
    "migration must create Organization table"
  );
  assert.ok(
    sql.includes(`CREATE TABLE "OrganizationMembership"`),
    "migration must create OrganizationMembership table"
  );
  // The @unique on personalForUserId is what makes
  // getActiveOrgId()'s fallback a single indexed lookup.
  assert.ok(
    sql.includes(`"Organization_personalForUserId_key"`),
    "migration must create the unique index on personalForUserId"
  );
  // The @unique on clerkOrgId is what makes the webhook upserts
  // idempotent.
  assert.ok(
    sql.includes(`"Organization_clerkOrgId_key"`),
    "migration must create the unique index on clerkOrgId"
  );
  // The WatchList.organizationId column MUST be nullable in this
  // migration. The backfill script runs against the existing rows
  // before a follow-up PR enforces NOT NULL.
  assert.ok(
    sql.includes(`ADD COLUMN "organizationId" TEXT;`) &&
      !sql.includes(`ADD COLUMN "organizationId" TEXT NOT NULL`),
    "migration must add organizationId as a NULLABLE column"
  );
});

test("Phase 1 migration is additive — no destructive ALTER TABLE on existing data", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260522210000_multi_tenancy_phase_1/migration.sql"
    ),
    "utf8"
  );
  // No DROP TABLE / DROP COLUMN / RENAME on existing models. The
  // backfill script + a follow-up migration handle data state
  // transitions; THIS migration is schema-only and additive.
  assert.ok(!sql.match(/DROP\s+TABLE/i), "no DROP TABLE allowed");
  assert.ok(!sql.match(/DROP\s+COLUMN/i), "no DROP COLUMN allowed");
  assert.ok(
    !sql.match(/ALTER\s+TABLE\s+"WatchList"\s+RENAME/i),
    "no RENAME on WatchList allowed"
  );
});
