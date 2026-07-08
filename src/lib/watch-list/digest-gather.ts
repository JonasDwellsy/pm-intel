// Pure digest-gathering helpers — NO I/O, NO server-only imports, so they stay
// unit-testable. The impure orchestration (Prisma + Clerk + Resend) lives in
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
