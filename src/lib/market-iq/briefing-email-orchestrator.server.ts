import "server-only";
import { classifyMarketIqBriefingEmailCandidate } from "@/lib/market-iq/briefing-email-orchestrator";
import { prisma } from "@/lib/prisma";

export async function runMarketIqInternalBriefingDryRun(input: {
  triggerKind: "scheduled" | "manual";
  organizationId?: string;
}) {
  const run = await prisma.marketIqBriefingEmailRun.create({
    data: { triggerKind: input.triggerKind, dryRun: true },
  });

  try {
    const preferences = await prisma.marketIqBriefingEmailPreference.findMany({
      where: {
        enabled: true,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
      include: { organization: { select: { excludeFromDigests: true } } },
      orderBy: [{ organizationId: "asc" }, { userId: "asc" }],
    });
    let eligibleCount = 0;

    for (const preference of preferences) {
      const snapshot = await prisma.marketIqBriefingSnapshot.findFirst({
        where: { organizationId: preference.organizationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      const delivery = snapshot
        ? await prisma.marketIqBriefingEmailDelivery.findUnique({
            where: { snapshotId_userId: { snapshotId: snapshot.id, userId: preference.userId } },
            select: { status: true },
          })
        : null;
      const classification = classifyMarketIqBriefingEmailCandidate({
        organizationExcluded: preference.organization.excludeFromDigests,
        snapshotId: snapshot?.id ?? null,
        deliveryStatus: delivery?.status ?? null,
      });
      if (classification.status === "would_send") eligibleCount += 1;
      await prisma.marketIqBriefingEmailRunItem.create({
        data: {
          runId: run.id,
          organizationId: preference.organizationId,
          preferenceId: preference.id,
          snapshotId: snapshot?.id ?? null,
          userId: preference.userId,
          recipientEmail: preference.recipientEmail,
          status: classification.status,
          detail: classification.detail,
        },
      });
    }

    return prisma.marketIqBriefingEmailRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        candidateCount: preferences.length,
        eligibleCount,
        skippedCount: preferences.length - eligibleCount,
        completedAt: new Date(),
      },
      include: { items: { orderBy: [{ organizationId: "asc" }, { userId: "asc" }] } },
    });
  } catch (error) {
    await prisma.marketIqBriefingEmailRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
