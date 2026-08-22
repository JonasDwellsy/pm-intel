-- One scheduled operation may be replayed safely, while the partial unique
-- index makes PostgreSQL the authority on whether a market already has an
-- active listing-feed run. Stale loading rows are recovered by the runner
-- before it attempts to acquire this constraint.

ALTER TABLE "MarketIqListingFeedRun"
  ADD COLUMN "operationKey" TEXT;

CREATE UNIQUE INDEX "MarketIqListingFeedRun_operationKey_key"
  ON "MarketIqListingFeedRun"("operationKey");

CREATE UNIQUE INDEX "MarketIqListingFeedRun_one_loading_per_market_key"
  ON "MarketIqListingFeedRun"("marketId")
  WHERE "status" = 'loading';
