import type { OwnerWatchActivityEvent } from "@/lib/portfolio-iq/owner-watch-activity";

export interface RoutedOwnerAttention extends OwnerWatchActivityEvent {
  isNew: boolean;
  routeScore: number;
}

function routeScore(event: OwnerWatchActivityEvent): number {
  const kindScore = { source: 130, outcome: 105, decision: 95, evidence: 70 }[event.kind];
  const severityScore = event.severity === "high" ? 25 : event.severity === "medium" ? 12 : 0;
  return kindScore + severityScore;
}

export function routeOwnerAttention(input: {
  events: Array<OwnerWatchActivityEvent & { isNew: boolean }>;
  limit?: number;
  since?: Date | null;
}): { routed: RoutedOwnerAttention[]; eligibleUnreadCount: number } {
  const eligible = input.events.filter((event) =>
    event.isNew &&
    (!input.since || event.occurredAt > input.since) &&
    (event.kind !== "evidence" || event.severity !== "info")
  );
  const routed = eligible.map((event) => ({ ...event, routeScore: routeScore(event) }))
    .sort((left, right) => right.routeScore - left.routeScore || right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, input.limit ?? 5);
  return { routed, eligibleUnreadCount: eligible.length };
}
