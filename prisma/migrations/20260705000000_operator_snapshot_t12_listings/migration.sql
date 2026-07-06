-- v0.25 — per-snapshot T12 listing count on OperatorSnapshot. Feeds the
-- Momentum "Listing share" sparkline: an operator's share of its market's
-- listing activity per snapshot date = this column ÷ the market's summed
-- t12ListingsCount that date. Nullable; the live seed populates it going
-- forward and the trajectory backfill re-run fills historical recon rows.
ALTER TABLE "OperatorSnapshot" ADD COLUMN "t12ListingsCount" INTEGER;
