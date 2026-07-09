-- Briefs V2 — per-snapshot 7-cell classification on OperatorSnapshot. Lets the
-- market brief's "since last period" change block detect cohort moves (e.g.
-- Hybrid -> Small MF/BTR) by diffing two consecutive snapshots. Nullable; the
-- live seed populates it going forward, older recon rows stay null until the
-- trajectory backfill re-run fills them.
ALTER TABLE "OperatorSnapshot" ADD COLUMN "quadrant7Cell" TEXT;
