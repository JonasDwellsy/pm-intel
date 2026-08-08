// Pure digest-gathering helpers — NO I/O, NO server-only imports, so they stay
// unit-testable. The impure orchestration (Prisma + Clerk + SendGrid) lives in
// digest-run.ts and imports these.
import { diffSnapshots, type OperatorChange } from "./change-detection";
import { applySimultaneityGuardrail, type DormancyEvent } from "./dormancy-guardrail";
import type { SnapshotRow } from "./snapshot";
import type { DigestListInput, DigestOperatorInput } from "./digest";
import { canViewList, type ListAuthShape } from "./visibility";

export function selectSnapshotPair(dates: Date[]): { latest: Date; prior: Date } | null {
  const distinct = Array.from(new Set(dates.map((d) => d.getTime()))).sort((a, b) => b - a);
  if (distinct.length < 2) return null;
  return { latest: new Date(distinct[0]), prior: new Date(distinct[1]) };
}

export interface OperatorMeta {
  name: string;
  marketLabel: string;
  scorecardUrl: string;
  /** Canonical operator id — the same operator across its markets. Only the
   *  dormancy guardrail reads it, to tell "one market went quiet" apart from
   *  "every market went quiet at once". */
  operatorKey: string;
}

export function buildListChanges(args: {
  watchListName: string;
  matchedPmSlugs: string[];
  latestBySlug: Map<string, SnapshotRow>;
  priorBySlug: Map<string, SnapshotRow>;
  metaBySlug: Map<string, OperatorMeta>;
}): DigestListInput {
  const draft: { pmSlug: string; meta: OperatorMeta; changes: OperatorChange[] }[] = [];
  const dormancyEvents: DormancyEvent[] = [];

  for (const slug of args.matchedPmSlugs) {
    const cur = args.latestBySlug.get(slug);
    const prev = args.priorBySlug.get(slug);
    const meta = args.metaBySlug.get(slug);
    if (!cur || !prev || !meta) continue; // need both snapshots + display meta
    const changes = diffSnapshots(prev, cur);
    if (changes.length === 0) continue;
    draft.push({ pmSlug: slug, meta, changes });
    for (const c of changes) {
      if (c.type === "dormancy" && c.direction === "entered") {
        dormancyEvents.push({
          operatorKey: meta.operatorKey,
          pmSlug: slug,
          lastListingDate: c.lastListingDate,
        });
      }
    }
  }

  // An operator whose markets ALL went quiet in the same fortnight is a
  // coverage event, not thirteen separate operator decisions. Collapse those
  // into one neutral note; leave genuinely per-market quiet alone.
  const { suppressedPmSlugs, coverageNotes } =
    applySimultaneityGuardrail(dormancyEvents);
  // The note lands on one row per operator — the first by slug, so the same
  // input always produces the same digest.
  const noteCarrier = new Map<string, string>();
  for (const e of [...dormancyEvents].sort((a, b) => a.pmSlug.localeCompare(b.pmSlug))) {
    if (suppressedPmSlugs.has(e.pmSlug) && !noteCarrier.has(e.operatorKey)) {
      noteCarrier.set(e.operatorKey, e.pmSlug);
    }
  }

  const operators: DigestOperatorInput[] = [];
  for (const d of draft) {
    let changes = d.changes;
    if (suppressedPmSlugs.has(d.pmSlug)) {
      changes = changes.filter(
        (c) => !(c.type === "dormancy" && c.direction === "entered")
      );
      const note = coverageNotes.get(d.meta.operatorKey);
      if (note && noteCarrier.get(d.meta.operatorKey) === d.pmSlug) {
        changes = [...changes, note];
      }
    }
    // An operator whose ONLY change was a suppressed dormancy event now has
    // nothing to report and drops out of the digest entirely.
    if (changes.length === 0) continue;
    operators.push({ pmSlug: d.pmSlug, ...d.meta, changes });
  }
  return { watchListName: args.watchListName, operators };
}

// Task 8 (v0.29) — SECURITY-CRITICAL: this is the boundary between
// buildOrgListContext (digest-run.ts), which evaluates an org's ENTIRE
// list set once — private lists included — and the per-recipient email
// that actually goes out. buildOrgListContext is intentionally
// org-wide and prior-independent; it does NOT gate on who's receiving
// the digest. Every call site that fans out to a specific member MUST
// run that org-wide list set through this filter before any list's
// content reaches that member's rendered digest, or a private list
// owned by a different member (or org) leaks across the tenancy/
// visibility boundary — the same class of bug the Task 3 review
// caught in the digest's org-scoped content pass (see store.ts's
// listSharedForOrg / listAllForOrg comments). Pure — no IO — delegates
// entirely to canViewList (./visibility) so this file stays
// unit-testable without a database.
export function visibleListsForMember<T extends ListAuthShape>(
  lists: T[],
  member: { userId: string; organizationId: string },
): T[] {
  return lists.filter((l) => canViewList(l, member));
}

// Task 8 regression fix (preview leak) — runPreview (digest-run.ts) is a
// CRON_SECRET-gated diagnostic that sends to a caller-supplied email, not
// an org member: it has no recipient identity for visibleListsForMember to
// check ownership against. Since Task 8 widened buildOrgListContext to
// include an org's PRIVATE lists (so runDigest's per-member filter could see
// them), runPreview was left consuming that same unfiltered list set,
// meaning a preview could render a private list's content to an arbitrary
// email. Scope preview content to shared lists only — the org-wide content
// that's safe to show without a recipient to authorize against.
export function sharedListsOnly<T extends { isShared: boolean }>(lists: T[]): T[] {
  return lists.filter((l) => l.isShared === true);
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
