// Digest gathering. Pure helpers (snapshot-pair selection, per-list diff,
// recipient filtering) are unit-tested; the impure gatherers below reuse the
// same applyWatchList entitlement path as /results and the shared diff engine.
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { toSnapshotRow, type SnapshotRow } from "./snapshot";
import { buildDigest, type DigestListInput } from "./digest";
import { selectSnapshotPair, buildListChanges, filterSubscribed, type OperatorMeta } from "./digest-gather";
import { applyWatchList } from "@/lib/watch-list/apply";
import { projectResultsForView } from "@/lib/watch-list/results-view";
import { getEntitledMarketIds } from "@/lib/auth/market-entitlements.server";
import { signUnsubToken } from "./digest-unsubscribe";
import { listWatchListes } from "./store";
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

export async function runDigest(opts: {
  mode: "send" | "dryRun";
  previewEmail?: string;
}): Promise<DigestRunSummary> {
  const dryRun = opts.mode === "dryRun";
  const dates = await fetchSnapshotDates();
  const pair = selectSnapshotPair(dates);
  if (!pair) {
    return { snapshotDate: null, skipped: "fewer than two snapshot dates", recipients: 0, sent: 0, failed: 0, dryRun };
  }
  const { latest, prior } = pair;

  // Idempotency: skip if a completed run already covered `latest` (bypass for
  // preview/dryRun so a month can be re-previewed freely).
  if (!dryRun && !opts.previewEmail) {
    const existing = await prisma.watchListDigestRun.findFirst({
      where: { snapshotDate: latest, status: "completed" },
    });
    if (existing) {
      return { snapshotDate: latest.toISOString(), skipped: "already sent for this snapshot", recipients: 0, sent: 0, failed: 0, dryRun };
    }
  }

  const run = dryRun
    ? null
    : await prisma.watchListDigestRun.create({ data: { snapshotDate: latest, status: "running" } });

  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const base = appBase();

  // orgs owning >=1 watch list
  const orgRows = await prisma.watchList.findMany({
    where: { organizationId: { not: null } },
    distinct: ["organizationId"],
    select: { organizationId: true },
  });

  // recipient (userId+email) -> their aggregated lists
  const perRecipient = new Map<string, { email: string; lists: DigestListInput[] }>();
  const unsubscribed = new Set(
    (await prisma.digestPreference.findMany({ where: { unsubscribed: true }, select: { userId: true } }))
      .map((p) => p.userId),
  );

  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, clerkOrgId: true, name: true },
    });
    if (!org?.clerkOrgId) continue;

    // members via Clerk
    const client = await clerkClient();
    const members: { userId: string; email: string }[] = [];
    let offset = 0;
    for (;;) {
      const res = await client.organizations.getOrganizationMembershipList({
        organizationId: org.clerkOrgId, limit: 100, offset,
      });
      for (const m of res.data) {
        const uid = m.publicUserData?.userId;
        const email = m.publicUserData?.identifier;
        if (uid && email) members.push({ userId: uid, email });
      }
      if (res.data.length < 100) break;
      offset += 100;
    }
    const recipients = filterSubscribed(members, unsubscribed);
    if (recipients.length === 0) continue;

    // build this org's list-changes once (shared across its members).
    // Use the store layer (parses the JSON criteria columns into the
    // FilterCriterion[]/WeightedCriterion[] arrays applyWatchList expects —
    // the same records the /results page evaluates).
    const entitlement = await getEntitledMarketIds(org.id);
    const watchLists = await listWatchListes(org.id);
    const orgLists: DigestListInput[] = [];
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
      const [latestBySlug, priorBySlug] = await Promise.all([
        fetchSnapshotsAt(matchedPmSlugs, latest),
        fetchSnapshotsAt(matchedPmSlugs, prior),
      ]);
      const listChanges = buildListChanges({
        watchListName: wl.name, matchedPmSlugs, latestBySlug, priorBySlug, metaBySlug,
      });
      if (listChanges.operators.length > 0) orgLists.push(listChanges);
    }
    if (orgLists.length === 0) continue;

    for (const r of recipients) {
      const acc = perRecipient.get(r.userId) ?? { email: r.email, lists: [] };
      acc.lists.push(...orgLists);
      perRecipient.set(r.userId, acc);
    }
  }

  // compose + send
  let sent = 0, failed = 0, recipients = 0;
  for (const [userId, { email, lists }] of perRecipient) {
    const digest = buildDigest({
      recipientFirstName: null, monthLabel, lists,
      unsubscribeUrl: `${base}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&t=${signUnsubToken(userId)}`,
      scorecardBaseUrl: base,
    });
    if (!digest) continue; // no changes for this recipient
    recipients++;

    const target = opts.previewEmail ?? email;
    if (dryRun) { sent++; continue; }

    if (run && !opts.previewEmail) {
      const already = await prisma.watchListDigestSend.findUnique({
        where: { runId_userId: { runId: run.id, userId } },
      });
      if (already) continue; // retry-safe
    }
    const result = await sendEmail({ to: target, subject: digest.subject, html: digest.html, text: digest.text });
    if (result.ok) sent++; else failed++;
    if (run && !opts.previewEmail) {
      await prisma.watchListDigestSend.create({
        data: { runId: run.id, userId, email: target, status: result.ok ? "sent" : "failed" },
      });
    }
    if (opts.previewEmail) break; // preview sends exactly one email
  }

  if (run) {
    await prisma.watchListDigestRun.update({
      where: { id: run.id }, data: { status: "completed", completedAt: new Date(), recipientCount: recipients },
    });
  }
  return { snapshotDate: latest.toISOString(), skipped: "", recipients, sent, failed, dryRun };
}
