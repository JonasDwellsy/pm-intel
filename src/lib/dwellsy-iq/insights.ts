import { parseTodaySignalEvidence } from "@/lib/portfolio-iq/today";

export interface SharedInsightSignalInput {
  id: string;
  fingerprint: string;
  signalType: string;
  category: string;
  severity: string;
  confidence: string;
  rankScore: number;
  headline: string;
  narrative: string;
  ownerQuestion: string | null;
  evidence: string;
  status: string;
  observedAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}

export interface SharedInsightAssetInput {
  id: string;
  name: string;
  city: string;
  postalCode: string;
  assetType: string;
  observedOperatorName: string | null;
}

export interface SharedInsightAlertInput {
  id: string;
  geographyType: string;
  geographyValue: string;
  propertyType: string;
  bedrooms: number;
}

export function buildSharedInsightDraft(input: {
  organizationId: string;
  portfolioId: string;
  marketId: string;
  signal: SharedInsightSignalInput;
  asset: SharedInsightAssetInput | null;
  alert: SharedInsightAlertInput | null;
}) {
  const parsedEvidence = parseTodaySignalEvidence(input.signal.evidence);
  const evidenceSources = new Set<string>(["owner_portfolio"]);
  if (input.signal.category === "market" || input.alert) evidenceSources.add("dwellsy_iq_trends");
  if (input.signal.category === "performance") {
    evidenceSources.add("historical_listing_export");
    evidenceSources.add("approved_comps");
  }
  if (input.signal.category === "readiness") evidenceSources.add("activation_workflow");
  if (input.asset?.observedOperatorName) evidenceSources.add("observed_operator_activity");

  return {
    organizationId: input.organizationId,
    portfolioId: input.portfolioId,
    sourceSignalId: input.signal.id,
    sourceAlertId: input.alert?.id ?? parsedEvidence.alertId,
    fingerprint: input.signal.fingerprint,
    insightType: input.signal.signalType,
    category: input.signal.category,
    severity: input.signal.severity,
    confidence: input.signal.confidence,
    rankScore: input.signal.rankScore,
    headline: input.signal.headline,
    narrative: input.signal.narrative,
    suggestedFollowup: input.signal.ownerQuestion,
    marketId: input.marketId,
    geographyType: input.alert?.geographyType ?? (input.asset ? "property" : "market"),
    geographyValue: input.alert?.geographyValue ?? input.asset?.name ?? input.marketId,
    propertyType: input.alert?.propertyType ?? (input.asset?.assetType === "single_family" ? "house" : input.asset ? "apartment" : null),
    bedrooms: input.alert?.bedrooms ?? parsedEvidence.bedrooms,
    evidenceSources: JSON.stringify([...evidenceSources]),
    status: input.signal.status,
    observedAt: input.signal.observedAt,
    firstSeenAt: input.signal.firstSeenAt,
    lastSeenAt: input.signal.lastSeenAt,
    resolvedAt: input.signal.resolvedAt,
  };
}

export function buildSharedExposureDraft(input: {
  insightId: string;
  signalId: string;
  asset: SharedInsightAssetInput;
  relevanceScore: number;
}) {
  return {
    insightId: input.insightId,
    assetId: input.asset.id,
    exposureKind: "direct",
    relevanceScore: input.relevanceScore,
    operatorName: input.asset.observedOperatorName,
    evidence: JSON.stringify({ sourceSignalId: input.signalId, assetId: input.asset.id }),
  };
}
