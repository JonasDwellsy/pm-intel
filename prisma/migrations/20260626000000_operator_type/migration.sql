-- v0.6.4 Patch 9 (Phase A) — operator company-type bucket.
--
-- Adds PM.operatorType ("pm" | "broker"). Defaults to "pm" so every
-- existing row backfills to the primary bucket with no data migration —
-- markets seeded before the source CSV carried company-type columns
-- behave exactly as before until they're re-exported and re-seeded.
--
-- "broker" rows are hidden from ranked lists by default (UI toggle to
-- show), scored in their own cohort, and still searchable with a
-- scorecard. "Property Management Software" / "Syndication Service"
-- companies are hard-excluded upstream in the pipeline and never reach
-- the DB at all, so they need no enum value here.

-- AlterTable
ALTER TABLE "PM" ADD COLUMN "operatorType" TEXT NOT NULL DEFAULT 'pm';

-- CreateIndex
CREATE INDEX "PM_marketId_operatorType_idx" ON "PM"("marketId", "operatorType");
