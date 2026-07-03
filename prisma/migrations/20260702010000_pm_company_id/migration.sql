-- v0.24 — Dwellsy company-page id per operator (effective grouping id:
-- parent_company_id if parented, else child_company_id). Deep-links each
-- operator to dwellsy.com/company/<id>. Nullable; backfilled by the seed on
-- the next deploy. Admin merge tool reads it; no index (admin-only path).
ALTER TABLE "PM" ADD COLUMN "companyId" TEXT;
