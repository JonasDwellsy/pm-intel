// Digest gathering. Pure helpers (snapshot-pair selection, per-list diff,
// recipient filtering) are unit-tested; the impure gatherers below reuse the
// same applyWatchList entitlement path as /results and the shared diff engine.
import { prisma } from "@/lib/prisma";
import { diffSnapshots } from "./change-detection";
import { toSnapshotRow, type SnapshotRow } from "./snapshot";
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

/** Newest snapshot per slug AT a specific date (equality on snapshotDate). */
export async function fetchSnapshotsAt(
  pmSlugs: string[],
  date: Date,
): Promise<Map<string, SnapshotRow>> {
  if (pmSlugs.length === 0) return new Map();
  const rows = await prisma.operatorSnapshot.findMany({
    where: { pmSlug: { in: pmSlugs }, snapshotDate: date },
    orderBy: [{ pmSlug: "asc" }],
  });
  const bySlug = new Map<string, SnapshotRow>();
  for (const row of rows) if (!bySlug.has(row.pmSlug)) bySlug.set(row.pmSlug, toSnapshotRow(row));
  return bySlug;
}

/** All distinct snapshot dates present, newest first. */
export async function fetchSnapshotDates(): Promise<Date[]> {
  const rows = await prisma.operatorSnapshot.findMany({
    distinct: ["snapshotDate"],
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  return rows.map((r) => r.snapshotDate);
}
