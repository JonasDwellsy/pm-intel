import "server-only";

import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES } from "@/lib/market-iq/billing/plans";
import { ensureRecurringMarketIqEditionDraft, type RecurringEditionResult } from "@/lib/market-iq/report/recurring-edition.server";
import { prisma } from "@/lib/prisma";

export type OrchestrationItemStatus = "created" | "would_create" | "existing" | "unchanged" | "blocked" | "failed";

function dayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function resultDetail(result: RecurringEditionResult) {
  if (result.state === "draft_created") return `Created a private draft with ${result.materialChangeCount} material changes.`;
  if (result.state === "draft_would_create") return `Would create a private draft with ${result.materialChangeCount} material changes.`;
  if (result.state === "draft_exists") return `A private draft already exists with ${result.materialChangeCount} material changes.`;
  return "detail" in result ? result.detail : "The recurring edition state was preserved.";
}

function itemStatus(result: RecurringEditionResult): OrchestrationItemStatus {
  if (result.state === "draft_created") return "created";
  if (result.state === "draft_would_create") return "would_create";
  if (result.state === "draft_exists") return "existing";
  if (result.state === "same_period") return "unchanged";
  return "blocked";
}

export async function runMarketIqEditionOrchestrator(input: {
  dryRun?: boolean;
  triggerKind?: "scheduled" | "manual";
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun === true;
  const triggerKind = input.triggerKind ?? "scheduled";
  const runKey = `${triggerKind}:${dryRun ? "dry" : "live"}:${dayKey(now)}`;
  const existingRun = await prisma.marketIqEditionOrchestrationRun.findUnique({
    where: { runKey },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  if (existingRun) return { reused: true, run: existingRun };

  let run;
  try {
    run = await prisma.marketIqEditionOrchestrationRun.create({
      data: { runKey, triggerKind, dryRun, startedAt: now },
    });
  } catch {
    const concurrent = await prisma.marketIqEditionOrchestrationRun.findUnique({
      where: { runKey },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    if (concurrent) return { reused: true, run: concurrent };
    throw new Error("The Market IQ orchestration run could not be started.");
  }

  try {
    const organizations = await prisma.organization.findMany({
      where: {
        brandProfile: { isNot: null },
        marketIqWorkspacePreference: {
          is: { onboardingCompletedAt: { not: null }, defaultMarketId: CLEVELAND_MARKET_ID },
        },
        marketIqReports: { some: { marketId: CLEVELAND_MARKET_ID, status: "published" } },
        OR: [
          {
            marketIqSubscriptions: {
              some: {
                status: { in: [...ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES] },
                markets: { some: { marketId: CLEVELAND_MARKET_ID } },
              },
            },
          },
          {
            AND: [
              { marketIqSubscriptions: { none: { status: { in: [...ACTIVE_MARKET_IQ_SUBSCRIPTION_STATUSES] } } } },
              { productAccess: { some: { productKey: "market_iq" } } },
              { OR: [{ allMarkets: true }, { marketAccess: { some: { marketId: CLEVELAND_MARKET_ID } } }] },
            ],
          },
        ],
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const counts = { created: 0, existing: 0, unchanged: 0, blocked: 0, failed: 0 };
    let sourceAvailableThrough: string | null = null;
    for (const organization of organizations) {
      try {
        const result = await ensureRecurringMarketIqEditionDraft(
          organization.id,
          CLEVELAND_MARKET_ID,
          { dryRun },
        );
        const status = itemStatus(result);
        if (status === "created" || status === "would_create") counts.created += 1;
        else if (status === "existing") counts.existing += 1;
        else if (status === "unchanged") counts.unchanged += 1;
        else counts.blocked += 1;
        if (result.periodEnd && (!sourceAvailableThrough || result.periodEnd > sourceAvailableThrough)) {
          sourceAvailableThrough = result.periodEnd;
        }
        await prisma.marketIqEditionOrchestrationItem.create({
          data: {
            runId: run.id,
            organizationId: organization.id,
            marketId: CLEVELAND_MARKET_ID,
            status,
            periodEnd: result.periodEnd,
            draftId: "draftId" in result ? result.draftId : null,
            detail: resultDetail(result),
          },
        });
      } catch (error) {
        counts.failed += 1;
        await prisma.marketIqEditionOrchestrationItem.create({
          data: {
            runId: run.id,
            organizationId: organization.id,
            marketId: CLEVELAND_MARKET_ID,
            status: "failed",
            detail: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
          },
        });
      }
    }

    const completed = await prisma.marketIqEditionOrchestrationRun.update({
      where: { id: run.id },
      data: {
        status: counts.failed > 0 ? "completed_with_errors" : "completed",
        organizationsEvaluated: organizations.length,
        draftsCreated: counts.created,
        draftsExisting: counts.existing,
        unchangedPeriods: counts.unchanged,
        blockedOrganizations: counts.blocked,
        failedOrganizations: counts.failed,
        sourceAvailableThrough,
        completedAt: new Date(),
      },
      include: { items: { orderBy: { createdAt: "asc" } } },
    });
    return { reused: false, run: completed };
  } catch (error) {
    await prisma.marketIqEditionOrchestrationRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
