-- v0.8 dormant tier, phase 3: let a snapshot remember whether the operator was
-- listing. Dormancy is only detectable as a TRANSITION between two snapshots,
-- so the digest cannot report "went quiet" without this.
--
-- Both columns are nullable and purely additive. Rows written before this
-- migration carry NULL, and the diff treats an unknown prior status as "no
-- transition to report" — so the first digest after deploy does not fire a
-- dormancy alert for every operator at once.
ALTER TABLE "OperatorSnapshot" ADD COLUMN "operatorStatus" TEXT;
ALTER TABLE "OperatorSnapshot" ADD COLUMN "lastListingDate" TEXT;
