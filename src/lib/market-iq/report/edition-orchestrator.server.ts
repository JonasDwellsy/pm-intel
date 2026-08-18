import "server-only";

import { getMarketIqMarket } from "@/data/market-iq/markets";
import { organizationHasMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { publishAndDeliverMarketIqAutopilotEdition } from "@/lib/market-iq/report/autopilot.server";
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
        marketIqWorkspacePreference: { is: { onboardingCompletedAt: { not: null } } },
        marketIqMarketPreferences: { some: { recurringEditionsEnabled: true, configuredAt: { not: null } } },
      },
      select: {
        id: true,
        marketIqMarketPreferences: {
          where: { recurringEditionsEnabled: true, configuredAt: { not: null } },
          select: { marketId: true, deliveryMode: true, recurringEnabledByUserId: true },
          orderBy: { marketId: "asc" },
        },
      },
      orderBy: { id: "asc" },
    });

    const counts = { created: 0, existing: 0, unchanged: 0, blocked: 0, failed: 0 };
    let sourceAvailableThrough: string | null = null;
    let marketsEvaluated = 0;
    for (const organization of organizations) {
      for (const preference of organization.marketIqMarketPreferences) {
        marketsEvaluated += 1;
        const marketId = preference.marketId;
        try {
          const market = getMarketIqMarket(marketId);
          const hasAccess = market ? await organizationHasMarketIqAccess(organization.id, marketId) : false;
          const result: RecurringEditionResult = market && market.status === "live" && hasAccess
            ? await ensureRecurringMarketIqEditionDraft(organization.id, marketId, { dryRun })
            : { state: "blocked", periodEnd: null, detail: "The enrolled market is unavailable or is not included in this workspace." };
          const status = itemStatus(result);
          let detail = resultDetail(result);
          if (!dryRun && preference.deliveryMode === "autopilot" && "draftId" in result && result.draftId) {
            const autopilot = await publishAndDeliverMarketIqAutopilotEdition({
              organizationId: organization.id,
              marketId,
              draftId: result.draftId,
              actorUserId: preference.recurringEnabledByUserId ?? "market-iq-autopilot",
            });
            detail += autopilot.state === "published" || autopilot.state === "already_published"
              ? ` Monthly autopilot published the edition and sent it to ${autopilot.sent} of ${autopilot.approvedRecipients} approved recipients.${autopilot.failed || autopilot.suppressed ? " Unsuccessful deliveries require an explicit retry." : ""}`
              : " Monthly autopilot did not publish because its saved requirements were not met.";
          }
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
              marketId,
              status,
              periodEnd: result.periodEnd,
              draftId: "draftId" in result ? result.draftId : null,
              detail,
            },
          });
        } catch (error) {
          counts.failed += 1;
          await prisma.marketIqEditionOrchestrationItem.create({
            data: {
              runId: run.id,
              organizationId: organization.id,
              marketId,
              status: "failed",
              detail: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
            },
          });
        }
      }
    }

    const completed = await prisma.marketIqEditionOrchestrationRun.update({
      where: { id: run.id },
      data: {
        status: counts.failed > 0 ? "completed_with_errors" : "completed",
        organizationsEvaluated: marketsEvaluated,
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
