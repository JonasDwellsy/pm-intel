import "server-only";

import { createHash } from "node:crypto";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { prisma } from "@/lib/prisma";
import { loadMarketIqReportComposer } from "@/lib/market-iq/report/composer.server";
import { compareMarketIqEditions } from "@/lib/market-iq/report/edition-comparison";
import { buildMarketIqEditionWorkflow } from "@/lib/market-iq/report/edition-workflow";
import { decideRecurringEdition } from "@/lib/market-iq/report/recurring-edition";
import { applyMarketIqReportScope, buildMarketIqCoveragePreflight } from "@/lib/market-iq/report/scope";

export type RecurringEditionResult =
  | { state: "draft_created" | "draft_exists"; draftId: string; periodEnd: string; materialChangeCount: number }
  | { state: "baseline_required" | "source_unavailable" | "same_period" | "blocked"; periodEnd: string | null; detail: string };

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Creates at most one private draft for one authoritative Trends IQ period.
 * This function cannot publish a report, create a campaign, select recipients,
 * or send email. Those remain separate PM-controlled actions.
 */
export async function ensureRecurringMarketIqEditionDraft(
  organizationId: string,
  marketId = CLEVELAND_MARKET_ID,
): Promise<RecurringEditionResult> {
  if (marketId !== CLEVELAND_MARKET_ID) {
    return { state: "blocked", periodEnd: null, detail: "The recurring engine is currently enabled only for the Cleveland pilot market." };
  }

  const composer = await loadMarketIqReportComposer(organizationId);
  if (!composer) return { state: "blocked", periodEnd: null, detail: "The Market IQ workspace could not be loaded." };
  if (composer.preview.source !== "dwellsy_trends") {
    return { state: "source_unavailable", periodEnd: null, detail: "Authoritative Trends IQ data is unavailable. No draft was created from preview data." };
  }
  if (!composer.priorEdition) {
    return { state: "baseline_required", periodEnd: composer.preview.snapshot.scope.periodEnd, detail: "Publish the reviewed launch baseline before enabling recurring editions." };
  }

  const current = applyMarketIqReportScope(composer.preview.snapshot, composer.initialSelection);
  const prior = {
    ...composer.priorEdition,
    snapshot: applyMarketIqReportScope(composer.priorEdition.snapshot, composer.initialSelection),
  };
  const comparison = compareMarketIqEditions(current, prior);
  const coverage = buildMarketIqCoveragePreflight(current);
  const workflow = buildMarketIqEditionWorkflow({
    current,
    prior: prior.snapshot,
    source: composer.preview.source,
    coverageCounts: coverage.counts,
    comparison,
  });
  const existing = await prisma.marketIqEditionDraft.findUnique({
    where: { organizationId_marketId_periodEnd: { organizationId, marketId, periodEnd: workflow.currentPeriodEnd } },
    select: { id: true, periodEnd: true, materialChangeCount: true },
  });
  const decision = decideRecurringEdition({
    source: composer.preview.source,
    currentPeriodEnd: workflow.currentPeriodEnd,
    priorPeriodEnd: workflow.priorPeriodEnd,
    readinessPassed: workflow.canPrepare,
    draftExists: Boolean(existing),
  });
  if (decision.action === "skip") {
    if (decision.reason === "draft_exists" && existing) return { state: "draft_exists", draftId: existing.id, periodEnd: existing.periodEnd, materialChangeCount: existing.materialChangeCount };
    if (decision.reason === "same_period") return { state: "same_period", periodEnd: workflow.currentPeriodEnd, detail: "Trends IQ has not advanced beyond the latest published edition." };
    return { state: "blocked", periodEnd: workflow.currentPeriodEnd, detail: "The saved scope does not pass the recurring-edition readiness checks." };
  }

  const frozen = {
    ...current,
    generatedAt: new Date().toISOString(),
    editionComparison: comparison,
  };
  const draft = await prisma.marketIqEditionDraft.upsert({
    where: { organizationId_marketId_periodEnd: { organizationId, marketId, periodEnd: workflow.currentPeriodEnd } },
    update: {},
    create: {
      organizationId,
      marketId,
      periodEnd: workflow.currentPeriodEnd,
      sourceKind: "dwellsy_trends",
      sourceAvailableThrough: workflow.currentPeriodEnd,
      scopeFingerprint: fingerprint({ scope: current.scope, source: "dwellsy_trends" }),
      snapshot: JSON.stringify(frozen),
      comparison: JSON.stringify(comparison),
      materialChangeCount: comparison.findings.length,
    },
    select: { id: true, periodEnd: true, materialChangeCount: true },
  });
  return { state: "draft_created", draftId: draft.id, periodEnd: draft.periodEnd, materialChangeCount: draft.materialChangeCount };
}
