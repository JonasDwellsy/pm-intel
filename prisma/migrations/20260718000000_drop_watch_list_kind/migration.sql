-- Phase 2 of 2 — physically drop the vestigial WatchList.kind column
-- (added in 20260717000000_watch_list_pins). Since hybrid watch lists,
-- pinned/smart/hybrid is derived from content (criteria-presence + pin
-- count) via src/lib/watch-list/kind.ts. Phase 1 (PR #255) removed every
-- code read/write of this column and shipped to prod first, so no running
-- deployment references it — this drop is safe on the shared Neon DB.
-- IF EXISTS guards the edge case where the column is already absent.
ALTER TABLE "WatchList" DROP COLUMN IF EXISTS "kind";
