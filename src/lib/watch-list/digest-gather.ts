// Pure digest-gathering helpers — NO I/O, NO server-only imports, so they stay
// unit-testable. The impure orchestration (Prisma + Clerk + SendGrid) lives in
// digest-run.ts and imports these.
import { diffSnapshots } from "./change-detection";
import type { SnapshotRow } from "./snapshot";
import type { DigestListInput, DigestOperatorInput } from "./digest";

export function selectSnapshotPair(dates: Date[]): { latest: Date; prior: Date } | null {
  const distinct = Array.from(new Set(dates.map((d) => d.getTime()))).sort((a, b) => b - a);
  if (distinct.length < 2) return null;
  return { latest: new Date(distinct[0]), prior: new Date(distinct[1]) };
}

export interface OperatorMeta {
  name: string;
  marketLabel: string;
  scorecardUrl: string;
}

export function buildListChanges(args: {
  watchListName: string;
  matchedPmSlugs: string[];
  latestBySlug: Map<string, SnapshotRow>;
  priorBySlug: Map<string, SnapshotRow>;
  metaBySlug: Map<string, OperatorMeta>;
}): DigestListInput {
  const operators: DigestOperatorInput[] = [];
  for (const slug of args.matchedPmSlugs) {
    const cur = args.latestBySlug.get(slug);
    const prev = args.priorBySlug.get(slug);
    const meta = args.metaBySlug.get(slug);
    if (!cur || !prev || !meta) continue; // need both snapshots + display meta
    const changes = diffSnapshots(prev, cur);
    if (changes.length === 0) continue;
    operators.push({ pmSlug: slug, ...meta, changes });
  }
  return { watchListName: args.watchListName, operators };
}

export function filterSubscribed(
  recipients: { userId: string; email: string }[],
  unsubscribedUserIds: Set<string>,
): { userId: string; email: string }[] {
  return recipients.filter((r) => !unsubscribedUserIds.has(r.userId));
}

export type Cadence = "daily" | "weekly" | "monthly";
export const PERIOD_DAYS: Record<Cadence, number> = { daily: 1, weekly: 7, monthly: 28 };

export function parseCadence(v: unknown): Cadence | null {
  return v === "daily" || v === "weekly" || v === "monthly" ? v : null;
}

const DAY_MS = 86_400_000;

// Should this recipient get a digest now? Cadence is an UPPER BOUND: send only
// when there is new data since they were last notified AND the throttle window
// has elapsed. (The non-empty-digest check happens in the orchestrator, since
// it needs the composed content.)
export function isDigestDue(args: {
  unsubscribed: boolean;
  cadence: Cadence;
  latest: Date;
  lastNotifiedSnapshotDate: Date | null;
  lastDigestAt: Date | null;
  now: Date;
}): boolean {
  if (args.unsubscribed) return false;
  if (args.lastNotifiedSnapshotDate && args.latest.getTime() <= args.lastNotifiedSnapshotDate.getTime()) {
    return false;
  }
  if (args.lastDigestAt) {
    const elapsedDays = (args.now.getTime() - args.lastDigestAt.getTime()) / DAY_MS;
    if (elapsedDays < PERIOD_DAYS[args.cadence]) return false;
  }
  return true;
}

// The snapshot date to diff `latest` against: "since you were last notified".
// Falls back to the second-most-recent distinct snapshot date for a first-ever
// digest (no watermark yet).
export function selectPriorForRecipient(
  latest: Date,
  lastNotifiedSnapshotDate: Date | null,
  distinctDatesDesc: Date[],
): Date | null {
  if (lastNotifiedSnapshotDate) return lastNotifiedSnapshotDate;
  const earlier = distinctDatesDesc.filter((d) => d.getTime() < latest.getTime());
  return earlier.length > 0 ? earlier[0] : null;
}
