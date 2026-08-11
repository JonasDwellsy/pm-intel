import type { LaunchBriefingSnapshot } from "@/lib/portfolio-iq/launch-briefing";

export type PortfolioChangeSeverity = "high" | "medium" | "info";

export interface PortfolioMonitoringChange {
  key: string;
  assetSlug: string | null;
  assetName: string | null;
  category: "rent" | "supply" | "comps" | "readiness" | "operator" | "decision";
  severity: PortfolioChangeSeverity;
  rankScore: number;
  headline: string;
  narrative: string;
  baselineValue: string;
  currentValue: string;
}

export interface PortfolioMonitoringComparison {
  generatedAt: string;
  baselineGeneratedAt: string;
  currentGeneratedAt: string;
  changes: PortfolioMonitoringChange[];
  materialCount: number;
  highPriorityCount: number;
  affectedAssetCount: number;
  executiveRead: string;
}

export type PortfolioMonitoringSourceHealth = "healthy" | "unchanged" | "unavailable";

export function classifyMonitoringSourceHealth(currentAvailableThrough: string | null, priorAvailableThrough: string | null): PortfolioMonitoringSourceHealth {
  if (!currentAvailableThrough) return "unavailable";
  if (priorAvailableThrough && currentAvailableThrough === priorAvailableThrough) return "unchanged";
  return "healthy";
}

export function selectAlertableMonitoringChanges(comparison: PortfolioMonitoringComparison, sourceHealth: PortfolioMonitoringSourceHealth): PortfolioMonitoringChange[] {
  // Decision changes are already derived from persistent signals. Turning one
  // back into another signal would create a recursive alert loop.
  const material = comparison.changes.filter((change) => change.severity !== "info" && change.category !== "decision");
  if (sourceHealth === "healthy") return material;
  return material.filter((change) => change.category === "operator" || change.category === "readiness");
}

function ownerQuestion(change: PortfolioMonitoringChange): string {
  if (change.category === "rent") return "What changed in pricing, unit mix, or leasing strategy since the approved baseline?";
  if (change.category === "supply") return "Is this movement driven by competitive supply, property availability, or a change in source coverage?";
  if (change.category === "comps") return "Does the current pricing plan still reflect the reviewed comparable set?";
  if (change.category === "operator") return "Should the observed manager assignment or benchmark be confirmed before the next owner review?";
  if (change.category === "decision") return "Who should own the investigation and report back to the asset-management team?";
  return "Does this reflect a real portfolio change or an evidence-resolution issue?";
}

export function monitoringChangeSignalDraft(input: {
  portfolioId: string;
  baselineGeneratedAt: string;
  current: LaunchBriefingSnapshot;
  change: PortfolioMonitoringChange;
  sourceHealth: PortfolioMonitoringSourceHealth;
}) {
  const asset = input.change.assetSlug ? input.current.assets.find((candidate) => candidate.slug === input.change.assetSlug) ?? null : null;
  const observedAt = input.current.sourceAvailableThrough
    ? new Date(`${input.current.sourceAvailableThrough}T23:59:59.999Z`)
    : new Date(input.current.generatedAt);
  const performanceCategory = ["rent", "supply", "comps", "operator", "decision"].includes(input.change.category);
  return {
    portfolioId: input.portfolioId,
    assetId: asset?.id ?? null,
    fingerprint: `${input.portfolioId}:monitoring:${input.change.key}`,
    signalType: `baseline_change_${input.change.category}`,
    category: performanceCategory ? "performance" : "readiness",
    severity: input.change.severity,
    confidence: input.sourceHealth === "healthy" && ["rent", "supply", "comps"].includes(input.change.category) ? "high" : "medium",
    rankScore: input.change.rankScore,
    headline: input.change.headline,
    narrative: input.change.narrative,
    ownerQuestion: ownerQuestion(input.change),
    evidence: JSON.stringify({
      sourceKind: "portfolio_monitoring",
      sourceHealth: input.sourceHealth,
      changeKey: input.change.key,
      category: input.change.category,
      baselineValue: input.change.baselineValue,
      currentValue: input.change.currentValue,
      baselineGeneratedAt: input.baselineGeneratedAt,
      sourceAvailableThrough: input.current.sourceAvailableThrough,
    }),
    observedAt,
  };
}

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

function addStatusChange(input: {
  changes: PortfolioMonitoringChange[];
  key: string;
  assetSlug: string;
  assetName: string;
  field: string;
  before: string;
  after: string;
}) {
  if (input.before === input.after) return;
  input.changes.push({
    key: input.key,
    assetSlug: input.assetSlug,
    assetName: input.assetName,
    category: "readiness",
    severity: "info",
    rankScore: 35,
    headline: `${input.assetName} ${input.field} changed`,
    narrative: `${input.field} moved from ${label(input.before)} to ${label(input.after)}. This is an evidence-readiness change, not a performance conclusion.`,
    baselineValue: label(input.before),
    currentValue: label(input.after),
  });
}

export function comparePortfolioSnapshots(baseline: LaunchBriefingSnapshot, current: LaunchBriefingSnapshot): PortfolioMonitoringComparison {
  const changes: PortfolioMonitoringChange[] = [];
  const baselineAssets = new Map(baseline.assets.map((asset) => [asset.id, asset]));
  const currentAssets = new Map(current.assets.map((asset) => [asset.id, asset]));

  for (const asset of current.assets) {
    const before = baselineAssets.get(asset.id);
    if (!before) {
      changes.push({ key: `asset-added:${asset.id}`, assetSlug: asset.slug, assetName: asset.name, category: "readiness", severity: "medium", rankScore: 60, headline: `${asset.name} was added to monitoring`, narrative: "This property was not present in the approved launch baseline and is now part of the portfolio view.", baselineValue: "Not in baseline", currentValue: asset.readinessStatus });
      continue;
    }

    if (before.askingRent !== null && asset.askingRent !== null && before.askingRent > 0) {
      const delta = ((asset.askingRent - before.askingRent) / before.askingRent) * 100;
      if (Math.abs(delta) >= 2) {
        const direction = delta > 0 ? "rose" : "softened";
        changes.push({
          key: `rent:${asset.id}`,
          assetSlug: asset.slug,
          assetName: asset.name,
          category: "rent",
          severity: Math.abs(delta) >= 5 ? "high" : "medium",
          rankScore: Math.min(95, 65 + Math.round(Math.abs(delta) * 4)),
          headline: `${asset.name} observed asking rent ${direction}`,
          narrative: `Observed asking rent moved ${signedPercent(delta)} from the approved baseline. Review the bedroom mix and comparable evidence before changing pricing.`,
          baselineValue: money(before.askingRent),
          currentValue: money(asset.askingRent),
        });
      }
    }

    if (before.observationCount > 0) {
      const observationDelta = ((asset.observationCount - before.observationCount) / before.observationCount) * 100;
      if (Math.abs(asset.observationCount - before.observationCount) >= 5 && Math.abs(observationDelta) >= 20) {
        changes.push({
          key: `supply:${asset.id}`,
          assetSlug: asset.slug,
          assetName: asset.name,
          category: "supply",
          severity: Math.abs(observationDelta) >= 40 ? "high" : "medium",
          rankScore: Math.min(88, 55 + Math.round(Math.abs(observationDelta) / 2)),
          headline: `${asset.name} listing evidence ${observationDelta > 0 ? "expanded" : "contracted"}`,
          narrative: `The observed listing count changed ${signedPercent(observationDelta)}. This can reflect supply, source coverage, or both, so the underlying listings should be reviewed before drawing a demand conclusion.`,
          baselineValue: `${before.observationCount} observations`,
          currentValue: `${asset.observationCount} observations`,
        });
      }
    }

    if (before.askingRentVsComps !== null && asset.askingRentVsComps !== null) {
      const spreadDelta = asset.askingRentVsComps - before.askingRentVsComps;
      if (Math.abs(spreadDelta) >= 2) {
        changes.push({
          key: `comps:${asset.id}`,
          assetSlug: asset.slug,
          assetName: asset.name,
          category: "comps",
          severity: Math.abs(spreadDelta) >= 5 ? "high" : "medium",
          rankScore: Math.min(92, 62 + Math.round(Math.abs(spreadDelta) * 4)),
          headline: `${asset.name} shifted relative to locked comps`,
          narrative: `The property-to-comp asking-rent spread moved ${signedPercent(spreadDelta)} since launch. The comparison uses only the reviewed, locked comp set.`,
          baselineValue: `${signedPercent(before.askingRentVsComps)} vs comps`,
          currentValue: `${signedPercent(asset.askingRentVsComps)} vs comps`,
        });
      }
    }

    addStatusChange({ changes, key: `readiness:${asset.id}`, assetSlug: asset.slug, assetName: asset.name, field: "monitoring status", before: before.readinessStatus, after: asset.readinessStatus });
    addStatusChange({ changes, key: `match:${asset.id}`, assetSlug: asset.slug, assetName: asset.name, field: "property match", before: before.matchStatus, after: asset.matchStatus });
    addStatusChange({ changes, key: `uru:${asset.id}`, assetSlug: asset.slug, assetName: asset.name, field: "listing coverage", before: before.uruStatus, after: asset.uruStatus });
    addStatusChange({ changes, key: `comp-status:${asset.id}`, assetSlug: asset.slug, assetName: asset.name, field: "comp review", before: before.compStatus, after: asset.compStatus });

    if (before.observedOperatorName !== asset.observedOperatorName || before.operatorRank !== asset.operatorRank) {
      changes.push({
        key: `operator:${asset.id}`,
        assetSlug: asset.slug,
        assetName: asset.name,
        category: "operator",
        severity: before.observedOperatorName !== asset.observedOperatorName ? "high" : "medium",
        rankScore: before.observedOperatorName !== asset.observedOperatorName ? 85 : 58,
        headline: `${asset.name} observed operator context changed`,
        narrative: "The observed assignment or Operator IQ benchmark differs from the approved baseline. This remains observed listing evidence, not a verified management contract.",
        baselineValue: `${before.observedOperatorName ?? "Unresolved"}${before.operatorRank ? `, ${before.operatorRank}` : ""}`,
        currentValue: `${asset.observedOperatorName ?? "Unresolved"}${asset.operatorRank ? `, ${asset.operatorRank}` : ""}`,
      });
    }
  }

  for (const asset of baseline.assets) {
    if (currentAssets.has(asset.id)) continue;
    changes.push({ key: `asset-removed:${asset.id}`, assetSlug: null, assetName: asset.name, category: "readiness", severity: "high", rankScore: 90, headline: `${asset.name} is no longer in the monitored portfolio`, narrative: "The property appeared in the approved baseline but is absent from the current portfolio evidence. Confirm whether this reflects a portfolio change or an identity issue.", baselineValue: "In baseline", currentValue: "Not currently observed" });
  }

  const baselineSignals = new Set(baseline.decisions.map((decision) => decision.signalId));
  for (const decision of current.decisions) {
    if (baselineSignals.has(decision.signalId)) continue;
    changes.push({ key: `decision:${decision.signalId}`, assetSlug: decision.assetSlug, assetName: decision.assetName, category: "decision", severity: decision.severity === "high" ? "high" : "medium", rankScore: decision.severity === "high" ? 88 : 68, headline: decision.headline, narrative: `This owner decision was not present in the approved launch baseline. ${decision.narrative}`, baselineValue: "Not active at launch", currentValue: "Active finding" });
  }

  changes.sort((left, right) => right.rankScore - left.rankScore || left.headline.localeCompare(right.headline));
  const material = changes.filter((change) => change.severity !== "info");
  const affectedAssets = new Set(material.flatMap((change) => change.assetName ? [change.assetName] : [])).size;
  const highPriorityCount = material.filter((change) => change.severity === "high").length;
  const executiveRead = material.length
    ? `${material.length} material ${material.length === 1 ? "change" : "changes"} across ${affectedAssets} ${affectedAssets === 1 ? "property" : "properties"} since the approved launch baseline. ${highPriorityCount ? `${highPriorityCount} require${highPriorityCount === 1 ? "s" : ""} prompt review.` : "None currently meet the high-priority threshold."}`
    : "No material portfolio changes are supported by the current evidence since the approved launch baseline.";

  return { generatedAt: new Date().toISOString(), baselineGeneratedAt: baseline.generatedAt, currentGeneratedAt: current.generatedAt, changes, materialCount: material.length, highPriorityCount, affectedAssetCount: affectedAssets, executiveRead };
}

export function portfolioWeekKey(value: Date): string {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
