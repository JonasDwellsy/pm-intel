import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DIGEST_KIND = {
  watchList: "watch_list",
  marketBrief: "market_brief",
} as const;

export type DigestKind = (typeof DIGEST_KIND)[keyof typeof DIGEST_KIND];
export type DeliveryOutcome =
  | { status: "sent"; providerMessageId: string }
  | { status: "failed"; error: string };

export interface DigestRunTotals {
  attempted: number;
  sent: number;
  failed: number;
  uncertain: number;
  skipped: number;
  status: "completed" | "completed_with_errors";
}

export function summarizeDigestRun(
  statuses: string[],
  skipped: number,
  forcedError = false,
): DigestRunTotals {
  const sent = statuses.filter((status) => status === "sent").length;
  const failed = statuses.filter((status) => status === "failed").length;
  const uncertain = statuses.filter((status) => status === "uncertain").length;
  return {
    attempted: statuses.length,
    sent,
    failed,
    uncertain,
    skipped,
    status:
      forcedError || failed > 0 || uncertain > 0
        ? "completed_with_errors"
        : "completed",
  };
}

export async function startDigestRun(kind: DigestKind, snapshotDate: Date) {
  return prisma.operatorDigestRun.create({
    data: { digestKind: kind, snapshotDate },
  });
}

/**
 * Atomically claims a recipient before the provider call. The database unique
 * key spans all runs, so an overlap or later retry receives `null` and must not
 * send. P2002 is the expected duplicate-claim result; other errors propagate.
 */
export async function claimDigestDelivery(input: {
  runId: string;
  digestKind: DigestKind;
  snapshotDate: Date;
  userId: string;
  email: string;
}): Promise<{ id: string } | null> {
  try {
    return await prisma.operatorDigestDelivery.create({ data: input });
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
  await prisma.operatorDigestDelivery.update({
    where: { id },
    data: outcome.status === "sent"
      ? {
          status: "sent",
          providerMessageId: outcome.providerMessageId || null,
          completedAt: new Date(),
        }
      : {
          status: "failed",
          error: outcome.error.slice(0, 2000),
          completedAt: new Date(),
        },
  });
}

/**
 * Converts any claim left unfinished by this invocation into `uncertain`.
 * Automatic retries remain blocked because an external provider may have
 * accepted the message before the process lost its response.
 */
export async function finalizeDigestRun(
  runId: string,
  skipped: number,
  forcedError = false,
): Promise<DigestRunTotals> {
  await prisma.operatorDigestDelivery.updateMany({
    where: { runId, status: "claimed" },
    data: {
      status: "uncertain",
      error: "The delivery did not reach a recorded provider outcome; automatic retry is blocked.",
      completedAt: new Date(),
    },
  });
  const deliveries = await prisma.operatorDigestDelivery.findMany({
    where: { runId },
    select: { status: true },
  });
  const totals = summarizeDigestRun(
    deliveries.map((delivery) => delivery.status),
    skipped,
    forcedError,
  );
  await prisma.operatorDigestRun.update({
    where: { id: runId },
    data: {
      status: totals.status,
      attemptedCount: totals.attempted,
      sentCount: totals.sent,
      failedCount: totals.failed,
      uncertainCount: totals.uncertain,
      skippedCount: totals.skipped,
      completedAt: new Date(),
    },
  });
  return totals;
}
