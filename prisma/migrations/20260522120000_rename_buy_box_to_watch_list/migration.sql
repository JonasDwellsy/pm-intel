-- v0.15 (PR #54) — rename the BuyBox table to WatchList.
--
-- The model started life as "BuyBox" in v0.8 (originally a literal
-- acquirer buy box — the structured criteria an investor uses to
-- decide which operators qualify for a target list). Product
-- positioning has shifted: the same row now backs a more general
-- "watch list" surface where users save sets of criteria they want
-- to track over time, not just acquisition shortlists. This
-- migration is a pure rename — no column shape change, no data
-- transformation, just renaming the table + its index + its primary-
-- key constraint so they all align under the new identifier.
--
-- A pure rename is safe in PostgreSQL: ALTER TABLE ... RENAME TO is
-- a catalog-only metadata change, takes a brief AccessExclusiveLock
-- against the table for the duration (typically <1ms even on multi-
-- million-row tables), and preserves every row, index entry, foreign
-- key, and statistic in place. No backfill required.
ALTER TABLE "BuyBox" RENAME TO "WatchList";
ALTER INDEX "BuyBox_pkey" RENAME TO "WatchList_pkey";
ALTER INDEX "BuyBox_ownerId_idx" RENAME TO "WatchList_ownerId_idx";
