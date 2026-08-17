-- Optional, reusable PM-authored defaults for Client Advisory editions.
-- Published report snapshots remain immutable and continue to carry their own
-- frozen copy, while these fields seed future client or prospect editions.
ALTER TABLE "OrganizationBrandProfile"
  ADD COLUMN "defaultClientMessage" TEXT,
  ADD COLUMN "defaultProspectMessage" TEXT,
  ADD COLUMN "companyProfile" TEXT,
  ADD COLUMN "companyCtaLabel" TEXT,
  ADD COLUMN "companyCtaUrl" TEXT;
