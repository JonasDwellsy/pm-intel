import "server-only";
import { prisma } from "@/lib/prisma";

export const MARKET_IQ_JOURNEY_MILESTONES = [
  "access",
  "setup",
  "edition",
  "test",
  "recipient",
  "audience",
  "delivery",
] as const;

export type MarketIqJourneyMilestone = (typeof MARKET_IQ_JOURNEY_MILESTONES)[number];
export type MarketIqJourneyStatus = "started" | "completed" | "failed";

type JourneyEventInput = {
  organizationId: string;
  actorUserId?: string | null;
  eventKey: string;
  milestone: MarketIqJourneyMilestone;
  status?: MarketIqJourneyStatus;
  sourceRoute?: string | null;
  subjectId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function compactMetadata(metadata: JourneyEventInput["metadata"] = {}) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}

export function marketIqMilestoneDedupeKey(organizationId: string, milestone: MarketIqJourneyMilestone) {
  return `market-iq:${organizationId}:${milestone}:completed`;
}

export function marketIqJourneyEventData(input: JourneyEventInput) {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventKey: input.eventKey,
    milestone: input.milestone,
    status: input.status ?? "completed",
    sourceRoute: input.sourceRoute ?? null,
    subjectId: input.subjectId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    metadata: JSON.stringify(compactMetadata(input.metadata)),
  };
}

/**
 * Records an explicit customer-journey transition. A supplied dedupe key makes
 * the event first-occurrence only; events without one remain an audit trail for
 * retries and failures. Metadata must stay operational and must not contain
 * email addresses, report content, or source observations.
 */
export async function recordMarketIqJourneyEvent(input: JourneyEventInput) {
  return prisma.marketIqJourneyEvent.createMany({
    data: [marketIqJourneyEventData(input)],
    skipDuplicates: true,
  });
}
