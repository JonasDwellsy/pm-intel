-- v0.18 (PR #65) — Multi-tenancy Phase 1: Clerk Organizations.
--
-- ADDITIVE-ONLY migration. Adds two new tables and one nullable
-- column on WatchList. Existing data is untouched; the backfill
-- script (scripts/migrate-to-orgs.ts) provisions personal orgs and
-- populates WatchList.organizationId. A follow-up migration in a
-- separate PR enforces NOT NULL on WatchList.organizationId AFTER
-- the backfill has run against production.
--
-- Deployment order — MUST be followed exactly:
--   1. Merge this PR → Vercel deploys → migration runs → schema
--      now has Organization + OrganizationMembership tables and
--      WatchList.organizationId (nullable).
--   2. Trigger Clerk to re-sync existing orgs (none expected yet,
--      since orgs are introduced in this PR) — N/A for first run.
--   3. Run `npm run migrate:to-orgs:dry-run` locally against the
--      production DB to preview changes (uses the same DATABASE_URL
--      pulled via `vercel env pull`).
--   4. Run `npm run migrate:to-orgs` for real. Provisions a Personal
--      org for every distinct WatchList.ownerId, then sets
--      WatchList.organizationId.
--   5. Verify `SELECT COUNT(*) FROM "WatchList" WHERE "organizationId" IS NULL;`
--      returns 0. (Modulo LEGACY_OWNER_ID rows from PR #50 — those
--      are not real users and stay NULL; the follow-up NOT-NULL
--      migration handles them by either backfilling to a sentinel
--      "legacy" org or deleting them. Decision deferred to that PR.)
--   6. Follow-up PR ships the NOT-NULL enforcing migration.

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "personalForUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Sync key for idempotent webhook upserts. Every
-- organization.{created,updated,deleted} webhook upserts on this.
CREATE UNIQUE INDEX "Organization_clerkOrgId_key"
  ON "Organization"("clerkOrgId");

-- CreateIndex
-- Enforces "at most one personal org per Clerk user". Doubles as
-- the lookup index for getActiveOrgId()'s fallback path:
--   prisma.organization.findFirst({ where: { personalForUserId: userId } })
CREATE UNIQUE INDEX "Organization_personalForUserId_key"
  ON "Organization"("personalForUserId");

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "clerkMembershipId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — sync key for webhook upserts.
CREATE UNIQUE INDEX "OrganizationMembership_clerkMembershipId_key"
  ON "OrganizationMembership"("clerkMembershipId");

-- CreateIndex — Clerk enforces "one membership per (user, org)";
-- mirror that here for idempotency on either-key webhook deliveries.
CREATE UNIQUE INDEX "OrganizationMembership_userId_organizationId_key"
  ON "OrganizationMembership"("userId", "organizationId");

-- CreateIndex — drives org switcher's "what orgs is this user in".
CREATE INDEX "OrganizationMembership_userId_idx"
  ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_idx"
  ON "OrganizationMembership"("organizationId");

-- AddForeignKey
ALTER TABLE "OrganizationMembership"
  ADD CONSTRAINT "OrganizationMembership_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
-- Nullable in Phase 1 (this PR). The backfill script populates it
-- for every existing row. A follow-up migration enforces NOT NULL
-- once the backfill is verified complete.
ALTER TABLE "WatchList"
  ADD COLUMN "organizationId" TEXT;

-- CreateIndex
-- Hot query: list all watch lists for an org, most-recently-updated
-- first. Mirrors the existing ownerId-indexed pattern.
CREATE INDEX "WatchList_organizationId_updatedAt_idx"
  ON "WatchList"("organizationId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "WatchList"
  ADD CONSTRAINT "WatchList_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
