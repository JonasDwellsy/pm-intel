import type { OwnerWatchActivityEvent } from "@/lib/portfolio-iq/owner-watch-activity";

export interface RoutedOwnerAttention extends OwnerWatchActivityEvent {
  isNew: boolean;
  routeScore: number;
  findingKey: string;
  eventCount: number;
  kinds: OwnerWatchActivityEvent["kind"][];
  events: Array<OwnerWatchActivityEvent & { isNew: boolean }>;
}

function routeScore(event: OwnerWatchActivityEvent): number {
  const kindScore = { source: 130, outcome: 105, decision: 95, evidence: 70 }[event.kind];
  const severityScore = event.severity === "high" ? 25 : event.severity === "medium" ? 12 : 0;
  return kindScore + severityScore;
}

const KIND_ORDER: OwnerWatchActivityEvent["kind"][] = ["evidence", "decision", "outcome", "source"];
const KIND_LABEL: Record<OwnerWatchActivityEvent["kind"], string> = {
  evidence: "market evidence",
  decision: "decision activity",
  outcome: "outcome review",
  source: "source health",
};

function findingKey(event: OwnerWatchActivityEvent): string {
  const decision = event.objects.find((object) => object.objectType === "decision");
  return decision ? `decision:${decision.objectKey}` : `event:${event.id}`;
}

function severityRank(severity: string): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function joinLabels(labels: string[]): string {
  if (labels.length < 2) return labels[0] ?? "activity";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function groupFinding(events: Array<OwnerWatchActivityEvent & { isNew: boolean }>): RoutedOwnerAttention {
  const ordered = [...events].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  const latest = ordered[0];
  const evidence = ordered.find((event) => event.kind === "evidence");
  const canonical = evidence ?? latest;
  const kinds = KIND_ORDER.filter((kind) => ordered.some((event) => event.kind === kind));
  const severity = ordered.reduce((highest, event) => severityRank(event.severity) > severityRank(highest) ? event.severity : highest, latest.severity);
  const objects = [...new Map(ordered.flatMap((event) => event.objects).map((object) => [`${object.objectType}:${object.objectKey}`, object])).values()];
  const groupScore = Math.max(...ordered.map(routeScore));
  const key = findingKey(latest);

  return {
    ...canonical,
    id: ordered.length === 1 ? canonical.id : `finding:${key}`,
    detail: ordered.length === 1
      ? canonical.detail
      : `${ordered.length} connected updates across ${joinLabels(kinds.map((kind) => KIND_LABEL[kind]))}. Latest: ${latest.headline}.`,
    href: canonical.href,
    severity,
    occurredAt: latest.occurredAt,
    objects,
    isNew: true,
    routeScore: groupScore,
    findingKey: key,
    eventCount: ordered.length,
    kinds,
    events: ordered,
  };
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
  const grouped = new Map<string, Array<OwnerWatchActivityEvent & { isNew: boolean }>>();
  for (const event of eligible) {
    const key = findingKey(event);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  const findings = [...grouped.values()].map(groupFinding);
  const routed = findings
    .sort((left, right) => right.routeScore - left.routeScore || right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, input.limit ?? 5);
  return { routed, eligibleUnreadCount: findings.length };
}
