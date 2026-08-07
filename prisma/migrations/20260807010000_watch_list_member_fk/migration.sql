-- Add the foreign key that schema.prisma has always declared but the database
-- never had.
--
-- WatchListMember was created in 20260717000000_watch_list_pins WITHOUT this
-- constraint, so `onDelete: Cascade` in the Prisma schema was never enforced at
-- the database level: deleting a WatchList could leave its member rows behind,
-- unreachable and invisible.
--
-- Verified safe before writing this: the live table holds 0 member rows across
-- 17 watch lists, and 0 orphans, so the ALTER has nothing to reject and there
-- is no cleanup to do first. Adding it now — while the table is empty — is the
-- cheapest this fix will ever be.

ALTER TABLE "WatchListMember"
  ADD CONSTRAINT "WatchListMember_watchListId_fkey"
  FOREIGN KEY ("watchListId") REFERENCES "WatchList"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
