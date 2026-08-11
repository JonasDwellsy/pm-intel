-- Portfolio IQ only: property-scoped PM collaboration briefs and responses.
CREATE TABLE "PortfolioIqPmBrief" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "title" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "ownerNote" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioIqPmBrief_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioIqPmBriefResponse" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "responderName" TEXT NOT NULL,
    "responderEmail" TEXT,
    "responseSummary" TEXT NOT NULL,
    "actionPlan" TEXT,
    "followUpDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioIqPmBriefResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortfolioIqPmBrief_publicToken_key" ON "PortfolioIqPmBrief"("publicToken");
CREATE INDEX "PortfolioIqPmBrief_portfolioId_status_publishedAt_idx" ON "PortfolioIqPmBrief"("portfolioId", "status", "publishedAt" DESC);
CREATE INDEX "PortfolioIqPmBrief_assetId_publishedAt_idx" ON "PortfolioIqPmBrief"("assetId", "publishedAt" DESC);
CREATE INDEX "PortfolioIqPmBrief_signalId_status_idx" ON "PortfolioIqPmBrief"("signalId", "status");
CREATE UNIQUE INDEX "PortfolioIqPmBriefResponse_briefId_key" ON "PortfolioIqPmBriefResponse"("briefId");
CREATE INDEX "PortfolioIqPmBriefResponse_submittedAt_idx" ON "PortfolioIqPmBriefResponse"("submittedAt" DESC);

ALTER TABLE "PortfolioIqPmBrief" ADD CONSTRAINT "PortfolioIqPmBrief_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioIqPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqPmBrief" ADD CONSTRAINT "PortfolioIqPmBrief_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "PortfolioIqAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqPmBrief" ADD CONSTRAINT "PortfolioIqPmBrief_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "PortfolioIqSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioIqPmBriefResponse" ADD CONSTRAINT "PortfolioIqPmBriefResponse_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "PortfolioIqPmBrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
