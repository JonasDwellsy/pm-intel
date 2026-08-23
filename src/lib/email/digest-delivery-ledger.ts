import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DIGEST_KIND = {
  watchList: "watch-list",
  marketBrief: "market-brief",
} as const;

export type DigestKind = (typeof DIGEST_KIND)[keyof typeof DIGEST_KIND];
export type DeliveryOutcome = { status: "sent" } | { status: "failed" };

export interface DigestRunTotals {
  attempted: number;
  sent: number;
  failed: number;
  uncertain: number;
  claimed: number;
  skipped: number;
  status: "completed" | "completed_with_errors";
}

export function digestRunId(kind: DigestKind, snapshotDate: Date): string {
  return `operator-digest:${kind}:${snapshotDate.toISOString()}`;
}

export function digestKindFromRunId(runId: string): DigestKind {
  if (runId.startsWith(`operator-digest:${DIGEST_KIND.marketBrief}:`)) {
    return DIGEST_KIND.marketBrief;
  }
  return DIGEST_KIND.watchList;
}

export function summarizeDigestRun(
  statuses: string[],
  skipped: number,
  forcedError = false,
): DigestRunTotals {
  const sent = statuses.filter((status) => status === "sent").length;
  const failed = statuses.filter((status) => status === "failed").length;
  const uncertain = statuses.filter((status) => status === "uncertain").length;
  const claimed = statuses.filter((status) => status === "claimed").length;
  return {
    attempted: statuses.length,
    sent,
    failed,
    uncertain,
    claimed,
    skipped,
    status:
      forcedError || failed > 0 || uncertain > 0 || claimed > 0
        ? "completed_with_errors"
        : "completed",
  };
}

/**
 * Both digest types share the existing watch-list run table. The deterministic
 * primary key makes concurrent upserts converge on one run without a schema
 * change, while the kind prefix keeps the two schedules independent.
 */
export async function startDigestRun(kind: DigestKind, snapshotDate: Date) {
  const id = digestRunId(kind, snapshotDate);
  return prisma.watchListDigestRun.upsert({
    where: { id },
    update: {},
    create: { id, snapshotDate, status: "running" },
  });
}

/**
 * Atomically claims a recipient before the provider call. The existing unique
 * key on runId/userId spans overlapping and later invocations because every
 * invocation for this digest snapshot uses the same deterministic run ID.
 */
export async function claimDigestDelivery(input: {
  runId: string;
  userId: string;
  email: string;
}): Promise<{ id: string } | null> {
  try {
    return await prisma.watchListDigestSend.create({
      data: { ...input, status: "claimed" },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
}

export async function completeDigestDelivery(
  id: string,
  outcome: DeliveryOutcome,
): Promise<void> {
  await prisma.watchListDigestSend.update({
    where: { id },
    data: { status: outcome.status },
  });
}

/**
 * Claims owned by this invocation that never reached a provider outcome become
 * uncertain. Their unique rows remain in place, so no later cron can risk an
 * ambiguous duplicate. The run summary is rebuilt from the delivery rows,
 * keeping the existing admin history reconciled without new database tables.
 */
export async function finalizeDigestRun(input: {
  runId: string;
  claimedDeliveryIds: string[];
  skipped: number;
  forcedError?: boolean;
}): Promise<DigestRunTotals> {
  if (input.claimedDeliveryIds.length > 0) {
    await prisma.watchListDigestSend.updateMany({
      where: {
        id: { in: input.claimedDeliveryIds },
        status: "claimed",
      },
      data: { status: "uncertain" },
    });
  }
  const deliveries = await prisma.watchListDigestSend.findMany({
    where: { runId: input.runId },
    select: { status: true },
  });
  const totals = summarizeDigestRun(
    deliveries.map((delivery) => delivery.status),
    input.skipped,
    input.forcedError,
  );
  await prisma.watchListDigestRun.update({
    where: { id: input.runId },
    data: {
      status: totals.status,
      recipientCount: totals.attempted,
      completedAt: new Date(),
    },
  });
  return totals;
}
