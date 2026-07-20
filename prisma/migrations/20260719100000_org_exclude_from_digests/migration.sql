-- Internal/demo/comp orgs opt-out of all outbound digest emails (brief + watch-list).
ALTER TABLE "Organization" ADD COLUMN "excludeFromDigests" BOOLEAN NOT NULL DEFAULT false;
