-- Additive shared decision layer for Dwellsy IQ Online. Market IQ and
-- Portfolio IQ remain authoritative source engines; these records connect an
-- owner-facing finding to its affected assets without changing Operator IQ.
CREATE TABLE "DwellsyIqInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "sourceSignalId" TEXT NOT NULL,
    "sourceAlertId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "rankScore" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "suggestedFollowup" TEXT,
    "marketId" TEXT NOT NULL,
    "geographyType" TEXT,
    "geographyValue" TEXT,
    "propertyType" TEXT,
    "bedrooms" INTEGER,
    "evidenceSources" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DwellsyIqInsight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DwellsyIqInsightExposure" (
    "id" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "exposureKind" TEXT NOT NULL DEFAULT 'direct',
    "relevanceScore" INTEGER NOT NULL,
    "operatorName" TEXT,
    "evidence" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DwellsyIqInsightExposure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DwellsyIqInsight_sourceSignalId_key" ON "DwellsyIqInsight"("sourceSignalId");
CREATE UNIQUE INDEX "DwellsyIqInsight_fingerprint_key" ON "DwellsyIqInsight"("fingerprint");
CREATE INDEX "DwellsyIqInsight_organizationId_status_rankScore_idx" ON "DwellsyIqInsight"("organizationId", "status", "rankScore" DESC);
CREATE INDEX "DwellsyIqInsight_portfolioId_status_rankScore_idx" ON "DwellsyIqInsight"("portfolioId", "status", "rankScore" DESC);
CREATE INDEX "DwellsyIqInsight_marketId_geographyType_geographyValue_observedAt_idx" ON "DwellsyIqInsight"("marketId", "geographyType", "geographyValue", "observedAt" DESC);
CREATE INDEX "DwellsyIqInsight_sourceAlertId_idx" ON "DwellsyIqInsight"("sourceAlertId");
CREATE UNIQUE INDEX "DwellsyIqInsightExposure_insightId_assetId_key" ON "DwellsyIqInsightExposure"("insightId", "assetId");
CREATE INDEX "DwellsyIqInsightExposure_assetId_relevanceScore_idx" ON "DwellsyIqInsightExposure"("assetId", "relevanceScore" DESC);

ALTER TABLE "DwellsyIqInsight" ADD CONSTRAINT "DwellsyIqInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DwellsyIqInsight" ADD CONSTRAINT "DwellsyIqInsight_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DwellsyIqInsight" ADD CONSTRAINT "DwellsyIqInsight_sourceSignalId_fkey" FOREIGN KEY ("sourceSignalId") REFERENCES "PortfolioIqSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DwellsyIqInsightExposure" ADD CONSTRAINT "DwellsyIqInsightExposure_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "DwellsyIqInsight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DwellsyIqInsightExposure" ADD CONSTRAINT "DwellsyIqInsightExposure_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the current Portfolio Watch so Today is immediately populated after
-- deployment. The existing signal remains the evidence and decision source.
INSERT INTO "DwellsyIqInsight" (
    "id", "organizationId", "portfolioId", "sourceSignalId", "fingerprint",
    "insightType", "category", "severity", "confidence", "rankScore",
    "headline", "narrative", "suggestedFollowup", "marketId",
    "geographyType", "geographyValue", "propertyType", "evidenceSources",
    "status", "observedAt", "firstSeenAt", "lastSeenAt", "resolvedAt", "updatedAt"
)
SELECT
    'iqi_' || md5(random()::text || clock_timestamp()::text || signal."id"),
    portfolio."organizationId", signal."portfolioId", signal."id", signal."fingerprint",
    signal."signalType", signal."category", signal."severity", signal."confidence", signal."rankScore",
    signal."headline", signal."narrative", signal."ownerQuestion", portfolio."marketId",
    CASE WHEN asset."id" IS NOT NULL THEN 'property' ELSE 'market' END,
    COALESCE(asset."name", portfolio."marketId"),
    CASE WHEN asset."assetType" = 'single_family' THEN 'house' WHEN asset."assetType" = 'multifamily' THEN 'apartment' ELSE NULL END,
    CASE
      WHEN signal."category" = 'market' THEN '["dwellsy_iq_trends","owner_portfolio"]'
      WHEN signal."category" = 'performance' THEN '["historical_listing_export","approved_comps","owner_portfolio"]'
      ELSE '["owner_portfolio","activation_workflow"]'
    END,
    signal."status", signal."observedAt", signal."firstSeenAt", signal."lastSeenAt", signal."resolvedAt", CURRENT_TIMESTAMP
FROM "PortfolioIqSignal" signal
JOIN "PortfolioIqPortfolio" portfolio ON portfolio."id" = signal."portfolioId"
LEFT JOIN "PortfolioIqAsset" asset ON asset."id" = signal."assetId"
ON CONFLICT ("sourceSignalId") DO NOTHING;

INSERT INTO "DwellsyIqInsightExposure" (
    "id", "insightId", "assetId", "exposureKind", "relevanceScore", "operatorName", "evidence", "updatedAt"
)
SELECT
    'iqe_' || md5(random()::text || clock_timestamp()::text || insight."id" || asset."id"),
    insight."id", asset."id", 'direct', insight."rankScore", asset."observedOperatorName",
    json_build_object('sourceSignalId', insight."sourceSignalId", 'assetId', asset."id")::text,
    CURRENT_TIMESTAMP
FROM "DwellsyIqInsight" insight
JOIN "PortfolioIqSignal" signal ON signal."id" = insight."sourceSignalId"
JOIN "PortfolioIqAsset" asset ON asset."id" = signal."assetId"
ON CONFLICT ("insightId", "assetId") DO NOTHING;
