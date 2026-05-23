-- v0.18 (PR #71) — Multi-tenancy Phase 3: PendingWelcome table.
--
-- Tracks "user X should see the welcome toast next time they're
-- active in org Y". Written by the organizationInvitation.accepted
-- webhook handler; consumed (read + delete) by /watch-lists on
-- the next page render where the user's active org matches.
--
-- Fully additive — no existing-table mutations. Zero backfill
-- needed; the table is empty at deploy time and stays small
-- (typically empty between invitation acceptance and the new
-- user's next /watch-lists visit).

-- CreateTable
CREATE TABLE "PendingWelcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingWelcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One pending welcome per (user × org). Used by the webhook upsert
-- AND the /watch-lists delete; covers the hot path entirely.
CREATE UNIQUE INDEX "PendingWelcome_userId_organizationId_key"
  ON "PendingWelcome"("userId", "organizationId");

-- CreateIndex
-- "List pending welcomes for user X" — used during /watch-lists
-- render to check if the user has ANY pending welcome (then we
-- match on activeOrgId in the application layer).
CREATE INDEX "PendingWelcome_userId_idx"
  ON "PendingWelcome"("userId");

-- AddForeignKey
-- Cascade-delete: if an Organization gets removed, any orphaned
-- pending welcomes for it go too.
ALTER TABLE "PendingWelcome"
  ADD CONSTRAINT "PendingWelcome_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
