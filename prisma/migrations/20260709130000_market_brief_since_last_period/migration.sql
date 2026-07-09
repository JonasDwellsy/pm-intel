-- Briefs V2 — "since last period" change lede on cached market briefs. Default
-- "" for existing rows; the PROMPT_VERSION bump folds into inputDigest so those
-- rows are treated as cache misses and regenerate with the new section on next
-- visit.
ALTER TABLE "MarketBrief" ADD COLUMN "sinceLastPeriod" TEXT NOT NULL DEFAULT '';
