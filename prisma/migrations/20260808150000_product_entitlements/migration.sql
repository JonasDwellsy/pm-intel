-- Dwellsy IQ Online product entitlements.
-- Additive only: no existing table, column, route, or authorization query is
-- changed. Operator IQ keeps using its current gates without consulting this
-- table. Existing organizations receive an operator_iq bookkeeping grant.

CREATE TABLE "OrganizationProductAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationProductAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationProductAccess_organizationId_productKey_key"
ON "OrganizationProductAccess"("organizationId", "productKey");

CREATE INDEX "OrganizationProductAccess_organizationId_idx"
ON "OrganizationProductAccess"("organizationId");

ALTER TABLE "OrganizationProductAccess"
ADD CONSTRAINT "OrganizationProductAccess_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "OrganizationProductAccess" ("id", "organizationId", "productKey", "createdAt")
SELECT 'opa_' || md5("id" || ':operator_iq'), "id", 'operator_iq', CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId", "productKey") DO NOTHING;
