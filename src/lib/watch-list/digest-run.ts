// Digest orchestration (impure: Prisma + Clerk + SendGrid). Pure gate/diff
// helpers live in digest-gather.ts (server-only-free, unit-tested). Per-recipient
// cadence gating: send only when there is new data since the recipient was last
// notified AND their cadence throttle has elapsed; diff against the snapshot they
// were last notified through ("since you last heard from us").
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { toSnapshotRow, type SnapshotRow } from "./snapshot";
import { buildDigest } from "./digest";
import { buildListChanges, isDigestDue, selectPriorForRecipient, parseCadence, type OperatorMeta } from "./digest-gather";
import { applyWatchList } from "@/lib/watch-list/apply";
import { projectResultsForView } from "@/lib/watch-list/results-view";
import { getEntitledMarketIds } from "@/lib/auth/market-entitlements.server";
import { signUnsubToken } from "./digest-unsubscribe";
import { listWatchListes, LEGACY_OWNER_ID } from "./store";
import { sendEmail } from "@/lib/email/send";

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

export interface DigestRunSummary {
  snapshotDate: string | null;
  skipped: string; // "" when not skipped
  recipients: number;
  sent: number;
  failed: number;
  dryRun: boolean;
}

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://iq.dwellsy.com";
}

/** Enumerate an org's members (userId + email) via the Clerk backend SDK. */
async function listOrgMembers(clerkOrgId: string): Promise<{ userId: string; email: string }[]> {
  const client = await clerkClient();
  const out: { userId: string; email: string }[] = [];
  let offset = 0;
  for (;;) {
    const res = await client.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId, limit: 100, offset,
    });
    for (const m of res.data) {
      const uid = m.publicUserData?.userId;
      const email = m.publicUserData?.identifier;
      if (uid && email) out.push({ userId: uid, email });
    }
    if (res.data.length < 100) break;
    offset += 100;
  }
  return out;
}

interface OrgListContext {
  lists: { name: string; matchedPmSlugs: string[]; metaBySlug: Map<string, OperatorMeta> }[];
  allSlugs: string[];
}

/** Evaluate an org's watch lists once (prior-independent): matched slugs +
 *  display metadata per list, plus the union of all matched slugs. Uses the
 *  store layer (parsed criteria) + the same entitlement-scoped applyWatchList
 *  path as /results.
 *
 *  v0.26 (Task 3) interim note: this pass is evaluated ONCE per org, before
 *  we know which individual member is being sent to (see the per-recipient
 *  loop in runDigest/runPreview below) — there's no single "authed userId"
 *  to thread through listWatchListes here the way every request-scoped
 *  caller does. Passing LEGACY_OWNER_ID (a sentinel no real Clerk user can
 *  match, see ./store) makes canViewList's "own" branch never fire, so this
 *  call surfaces exactly the org's SHARED lists — never a private list some
 *  other member owns. That's the safe interim behavior: it can undercount
 *  (a member's own private list won't appear in anyone's digest yet) but it
 *  cannot leak a teammate's private list. Task 8 (W-T8, "digest recipients
 *  follow visibility") replaces this with real per-recipient scoping so each
 *  member's digest also includes their own private lists. */
async function buildOrgListContext(orgId: string, base: string): Promise<OrgListContext> {
  const entitlement = await getEntitledMarketIds(orgId);
  const watchLists = await listWatchListes(LEGACY_OWNER_ID, orgId);
  const lists: OrgListContext["lists"] = [];
  const allSlugs = new Set<string>();
  for (const wl of watchLists) {
    const applied = await applyWatchList(
      { id: wl.id, name: wl.name, description: wl.description,
        requiredCriteria: wl.requiredCriteria, preferredCriteria: wl.preferredCriteria,
        excludedCriteria: wl.excludedCriteria },
      entitlement,
    );
    const matchedPmSlugs = applied.results.map((r) => r.pmSlug);
    if (matchedPmSlugs.length === 0) continue;
    const { marketRows } = projectResultsForView({
      marketResults: applied.results, operatorResults: applied.operatorResults,
      watchListId: wl.id, totalCandidates: applied.totalCandidates,
      totalOperators: applied.totalOperators, matchedCount: applied.matchedCount,
      matchedOperatorCount: applied.matchedOperatorCount, generatedAt: applied.generatedAt,
    });
    const metaBySlug = new Map<string, OperatorMeta>();
    for (const row of marketRows) {
      for (const dt of row.drillTargets) {
        metaBySlug.set(dt.pmSlug, {
          name: row.name, marketLabel: dt.marketName,
          scorecardUrl: dt.href.startsWith("http") ? dt.href : `${base}${dt.href}`,
        });
      }
    }
    matchedPmSlugs.forEach((s) => allSlugs.add(s));
    lists.push({ name: wl.name, matchedPmSlugs, metaBySlug });
  }
  return { lists, allSlugs: [...allSlugs] };
}

/** Preview: compose one digest against a generic (second-most-recent) window
 *  from the first org that has changes, and send only to `previewEmail`.
 *  Bypasses all gating + bookkeeping. */
async function runPreview(
  previewEmail: string, latest: Date, distinctDates: Date[],
): Promise<DigestRunSummary> {
  const base = appBase();
  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const prior = selectPriorForRecipient(latest, null, distinctDates);
  const orgRows = await prisma.watchList.findMany({
    where: { organizationId: { not: null } }, distinct: ["organizationId"], select: { organizationId: true },
  });
  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    const ctx = await buildOrgListContext(organizationId, base);
    if (ctx.lists.length === 0) continue;
    const latestBySlug = await fetchSnapshotsAt(ctx.allSlugs, latest);
    const priorBySlug = prior ? await fetchSnapshotsAt(ctx.allSlugs, prior) : new Map<string, SnapshotRow>();
    const lists = ctx.lists
      .map((c) => buildListChanges({ watchListName: c.name, matchedPmSlugs: c.matchedPmSlugs, latestBySlug, priorBySlug, metaBySlug: c.metaBySlug }))
      .filter((l) => l.operators.length > 0);
    const digest = buildDigest({
      recipientFirstName: null, monthLabel, lists,
      unsubscribeUrl: `${base}/api/digest/unsubscribe?u=preview&t=preview`,
      scorecardBaseUrl: base,
    });
    if (!digest) continue; // this org had no changes — try the next
    const result = await sendEmail({ to: previewEmail, subject: `[preview] ${digest.subject}`, html: digest.html, text: digest.text });
    return { snapshotDate: latest.toISOString(), skipped: "preview", recipients: 1, sent: result.ok ? 1 : 0, failed: result.ok ? 0 : 1, dryRun: false };
  }
  return { snapshotDate: latest.toISOString(), skipped: "preview: no org had changes", recipients: 0, sent: 0, failed: 0, dryRun: false };
}

export async function runDigest(opts: {
  mode: "send" | "dryRun";
  previewEmail?: string;
}): Promise<DigestRunSummary> {
  const dryRun = opts.mode === "dryRun";
  const now = new Date();
  const distinctDates = await fetchSnapshotDates(); // newest-first
  if (distinctDates.length === 0) {
    return { snapshotDate: null, skipped: "no snapshots", recipients: 0, sent: 0, failed: 0, dryRun };
  }
  const latest = distinctDates[0];

  if (opts.previewEmail) {
    return runPreview(opts.previewEmail, latest, distinctDates);
  }

  // Reuse an existing non-completed run for `latest` rather than minting a new
  // one, so the per-recipient WatchListDigestSend guard spans a cross-day retry
  // after a mid-run crash (a fresh run.id would re-key the guard).
  const run = dryRun
    ? null
    : ((await prisma.watchListDigestRun.findFirst({
        where: { snapshotDate: latest, status: { not: "completed" } },
        orderBy: { startedAt: "desc" },
      })) ??
      (await prisma.watchListDigestRun.create({ data: { snapshotDate: latest, status: "running" } })));

  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const base = appBase();

  const prefByUser = new Map(
    (await prisma.digestPreference.findMany()).map((p) => [p.userId, p]),
  );

  const orgRows = await prisma.watchList.findMany({
    where: { organizationId: { not: null } },
    distinct: ["organizationId"],
    select: { organizationId: true },
  });

  let sent = 0, failed = 0, recipients = 0;

  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId }, select: { id: true, clerkOrgId: true },
    });
    if (!org?.clerkOrgId) continue;

    const members = await listOrgMembers(org.clerkOrgId);
    // Per-recipient gate: subscribed + new data since last notified + throttle.
    const dueMembers = members.filter((m) => {
      const p = prefByUser.get(m.userId);
      return isDigestDue({
        unsubscribed: p?.unsubscribed ?? false,
        cadence: parseCadence(p?.cadence) ?? "monthly",
        latest,
        lastNotifiedSnapshotDate: p?.lastNotifiedSnapshotDate ?? null,
        lastDigestAt: p?.lastDigestAt ?? null,
        now,
      });
    });
    if (dueMembers.length === 0) continue;

    // Evaluate the org's watch lists once (prior-independent).
    const ctx = await buildOrgListContext(org.id, base);
    if (ctx.lists.length === 0) continue;
    const latestBySlug = await fetchSnapshotsAt(ctx.allSlugs, latest);

    // Fetch prior snapshots grouped by the distinct prior dates among due
    // members (usually 1–2), not one fetch per recipient.
    const priorForUser = new Map<string, Date | null>();
    const priorByDate = new Map<number, Map<string, SnapshotRow>>();
    for (const m of dueMembers) {
      const p = prefByUser.get(m.userId);
      const prior = selectPriorForRecipient(latest, p?.lastNotifiedSnapshotDate ?? null, distinctDates);
      priorForUser.set(m.userId, prior);
      if (prior && !priorByDate.has(prior.getTime())) {
        priorByDate.set(prior.getTime(), await fetchSnapshotsAt(ctx.allSlugs, prior));
      }
    }

    for (const m of dueMembers) {
      const prior = priorForUser.get(m.userId) ?? null;
      const priorBySlug = prior ? (priorByDate.get(prior.getTime()) ?? new Map<string, SnapshotRow>()) : new Map<string, SnapshotRow>();
      const lists = ctx.lists
        .map((c) => buildListChanges({
          watchListName: c.name, matchedPmSlugs: c.matchedPmSlugs,
          latestBySlug, priorBySlug, metaBySlug: c.metaBySlug,
        }))
        .filter((l) => l.operators.length > 0);
      const digest = buildDigest({
        recipientFirstName: null, monthLabel, lists,
        unsubscribeUrl: `${base}/api/digest/unsubscribe?u=${encodeURIComponent(m.userId)}&t=${signUnsubToken(m.userId)}`,
        scorecardBaseUrl: base,
      });
      if (!digest) continue;
      recipients++;
      if (dryRun) { sent++; continue; }
      if (run) {
        const already = await prisma.watchListDigestSend.findUnique({
          where: { runId_userId: { runId: run.id, userId: m.userId } },
        });
        if (already) continue; // retry-safe within a run
      }
      const result = await sendEmail({ to: m.email, subject: digest.subject, html: digest.html, text: digest.text });
      if (result.ok) sent++; else failed++;
      if (run) {
        await prisma.watchListDigestSend.create({
          data: { runId: run.id, userId: m.userId, email: m.email, status: result.ok ? "sent" : "failed" },
        });
        if (result.ok) {
          await prisma.digestPreference.upsert({
            where: { userId: m.userId },
            update: { lastNotifiedSnapshotDate: latest, lastDigestAt: now },
            create: { userId: m.userId, lastNotifiedSnapshotDate: latest, lastDigestAt: now },
          });
        }
      }
    }
  }

  if (run) {
    await prisma.watchListDigestRun.update({
      where: { id: run.id }, data: { status: "completed", completedAt: new Date(), recipientCount: recipients },
    });
  }
  return { snapshotDate: latest.toISOString(), skipped: "", recipients, sent, failed, dryRun };
}
