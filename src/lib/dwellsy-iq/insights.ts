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
  headline?: string;
  narrative?: string;
}

export interface SharedInsightExposedAssetInput extends SharedInsightAssetInput {
  relevanceScore: number;
}

function stripAssetPrefix(headline: string): string {
  const separator = headline.indexOf(": ");
  return separator >= 0 ? headline.slice(separator + 2) : headline;
}

export function portfolioExposureCopy(input: {
  signal: SharedInsightSignalInput;
  alert: SharedInsightAlertInput | null;
  exposedAssets: SharedInsightExposedAssetInput[];
}) {
  if (!input.alert || input.exposedAssets.length < 2) return {
    headline: input.signal.headline,
    narrative: input.signal.narrative,
    suggestedFollowup: input.signal.ownerQuestion,
  };
  const propertyNames = input.exposedAssets.map((asset) => asset.name);
  const displayed = propertyNames.slice(0, 3).join(", ");
  const remaining = propertyNames.length - 3;
  const exposureSentence = `${input.exposedAssets.length} portfolio assets are exposed: ${displayed}${remaining > 0 ? ` and ${remaining} more` : ""}.`;
  const alertHeadline = input.alert.headline ?? stripAssetPrefix(input.signal.headline);
  return {
    headline: `${alertHeadline}: ${input.exposedAssets.length} portfolio assets exposed`,
    narrative: `${input.alert.narrative ?? input.signal.narrative} ${exposureSentence}`,
    suggestedFollowup: "Review segment pricing, approved comp position, and operator response across the exposed properties.",
  };
}

export function buildSharedInsightDraft(input: {
  organizationId: string;
  portfolioId: string;
  marketId: string;
  signal: SharedInsightSignalInput;
  asset: SharedInsightAssetInput | null;
  alert: SharedInsightAlertInput | null;
  exposedAssets?: SharedInsightExposedAssetInput[];
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

  const copy = portfolioExposureCopy({ signal: input.signal, alert: input.alert, exposedAssets: input.exposedAssets ?? (input.asset ? [{ ...input.asset, relevanceScore: input.signal.rankScore }] : []) });
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
    headline: copy.headline,
    narrative: copy.narrative,
    suggestedFollowup: copy.suggestedFollowup,
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
  evidence?: Record<string, unknown>;
}) {
  return {
    insightId: input.insightId,
    assetId: input.asset.id,
    exposureKind: "direct",
    relevanceScore: input.relevanceScore,
    operatorName: input.asset.observedOperatorName,
    evidence: JSON.stringify({ sourceSignalId: input.signalId, assetId: input.asset.id, ...(input.evidence ?? {}) }),
  };
}
