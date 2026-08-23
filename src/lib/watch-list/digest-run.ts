// Digest orchestration (impure: Prisma + Clerk + SendGrid). Pure gate/diff
// helpers live in digest-gather.ts (server-only-free, unit-tested). Per-recipient
// cadence gating: send only when there is new data since the recipient was last
// notified AND their cadence throttle has elapsed; diff against the snapshot they
// were last notified through ("since you last heard from us"). A shared durable
// ledger claims each recipient before SendGrid, preventing overlapping runs from
// sending the same digest twice.
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";
import { clerkClient } from "@clerk/nextjs/server";
import { toSnapshotRow, type SnapshotRow } from "./snapshot";
import { buildDigest } from "./digest";
import { buildListChanges, isDigestDue, selectPriorForRecipient, parseCadence, visibleListsForMember, sharedListsOnly, type OperatorMeta } from "./digest-gather";
import { applyWatchList } from "@/lib/watch-list/apply";
import { shouldSkipCriteriaMatch } from "@/lib/watch-list/kind";
import { projectResultsForView } from "@/lib/watch-list/results-view";
import { getEntitledMarketIds } from "@/lib/auth/market-entitlements.server";
import { currentGenerationVersions } from "@/lib/operators/trajectory";
import { signUnsubToken } from "./digest-unsubscribe";
import { listAllForOrg, listMembers } from "./store";
import { sendEmail } from "@/lib/email/send";
import {
  claimDigestDelivery,
  completeDigestDelivery,
  DIGEST_KIND,
  finalizeDigestRun,
  startDigestRun,
} from "@/lib/email/digest-delivery-ledger";

/** Newest snapshot per slug AT a specific date (equality on snapshotDate).
 *  `methodologyVersions` (when given) restricts to the current estimator
 *  generation so a diff never mixes generations — see currentGenerationVersions. */
export async function fetchSnapshotsAt(
  pmSlugs: string[],
  date: Date,
  methodologyVersions?: string[],
): Promise<Map<string, SnapshotRow>> {
  if (pmSlugs.length === 0) return new Map();
  const rows = await prisma.operatorSnapshot.findMany({
    where: {
      pmSlug: { in: pmSlugs },
      snapshotDate: date,
      ...(methodologyVersions ? { methodologyVersion: { in: methodologyVersions } } : {}),
    },
    orderBy: [{ pmSlug: "asc" }],
  });
  const bySlug = new Map<string, SnapshotRow>();
  for (const row of rows) if (!bySlug.has(row.pmSlug)) bySlug.set(row.pmSlug, toSnapshotRow(row));
  return bySlug;
}

/** All distinct snapshot dates present, newest first. `methodologyVersions`
 *  (when given) restricts to the current estimator generation's dates. */
export async function fetchSnapshotDates(methodologyVersions?: string[]): Promise<Date[]> {
  const rows = await prisma.operatorSnapshot.findMany({
    where: methodologyVersions ? { methodologyVersion: { in: methodologyVersions } } : undefined,
    distinct: ["snapshotDate"],
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  return rows.map((r) => r.snapshotDate);
}

/** The current estimator generation's methodologyVersion set, from the latest
 *  snapshot; undefined when there are no snapshots (→ callers pass no filter). */
export async function currentDigestGenerationVersions(): Promise<string[] | undefined> {
  const latest = await prisma.operatorSnapshot.findFirst({
    orderBy: { snapshotDate: "desc" },
    select: { methodologyVersion: true },
  });
  return currentGenerationVersions(latest?.methodologyVersion) ?? undefined;
}

export interface DigestRunSummary {
  snapshotDate: string | null;
  skipped: string; // "" when not skipped
  recipients: number;
  sent: number;
  failed: number;
  dryRun: boolean;
  /** Orgs skipped mid-run because processing them threw (isolated, not fatal). */
  orgErrors?: number;
}

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://intel.iq.dwellsy.com";
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

interface OrgListEntry {
  name: string;
  ownerId: string;
  isShared: boolean;
  organizationId: string | null;
  matchedPmSlugs: string[];
  metaBySlug: Map<string, OperatorMeta>;
}
interface OrgListContext {
  lists: OrgListEntry[];
  allSlugs: string[];
}

/** Evaluate an org's watch lists once (prior-independent): matched slugs +
 *  display metadata per list, plus the union of all matched slugs. Uses the
 *  store layer (parsed criteria) + the same entitlement-scoped applyWatchList
 *  path as /results.
 *
 *  v0.26 (Task 3) interim note (SUPERSEDED by Task 8 below): this pass used
 *  to call `listSharedForOrg` (org's SHARED lists only) because there was no
 *  per-recipient scoping yet — a safe-but-undercounting stopgap that hid a
 *  member's own private list from every digest, including their own.
 *
 *  v0.29 (Task 8, "digest recipients follow visibility"): this now calls
 *  `listAllForOrg` — EVERY list in the org, private and shared — and carries
 *  each list's `{ ownerId, isShared, organizationId }` alongside
 *  matchedPmSlugs/metaBySlug. This function itself performs NO
 *  authorization: it is intentionally org-wide and prior-independent, since
 *  there's no single "authed userId" to check here (the loop runs once per
 *  org, before we know which individual member is being sent to). The
 *  security boundary is downstream: every caller that fans out to a
 *  specific recipient MUST filter this context's `lists` through
 *  `visibleListsForMember` (digest-gather.ts, wraps canViewList) BEFORE
 *  rendering any list's content into that member's email — see the
 *  per-recipient loop in runDigest below. Skipping that filter is exactly
 *  the class of leak the Task 3 review caught (a private list surfacing
 *  outside its owner). */
async function buildOrgListContext(orgId: string, base: string): Promise<OrgListContext> {
  const entitlement = await getEntitledMarketIds(orgId);
  const watchLists = await listAllForOrg(orgId);
  const lists: OrgListContext["lists"] = [];
  const allSlugs = new Set<string>();
  for (const wl of watchLists) {
    // v0.27 (Task 5) — pinned members union into each list's digest
    // context the same way they do on /results, still bounded by the
    // entitlement filter inside applyWatchList.
    const pins = new Set((await listMembers(wl.id)).map((m) => m.memberKey));
    // v0.28 (Task 8 follow-through) — a list with NO criteria (pins-only
    // by convention) skips the natural criteria-match loop so the digest
    // content is the pin union ONLY, not the entire operator universe.
    // Derived from criteria-presence, not the stored `kind` column.
    // Mirrors results/page.tsx and changes/page.tsx exactly (see
    // apply.ts's doc comment on the 4th parameter for the full rationale).
    const skipCriteria = shouldSkipCriteriaMatch(wl);
    const applied = await applyWatchList(
      { id: wl.id, name: wl.name, description: wl.description,
        requiredCriteria: wl.requiredCriteria, preferredCriteria: wl.preferredCriteria,
        excludedCriteria: wl.excludedCriteria },
      entitlement,
      pins,
      skipCriteria,
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
          name: row.name, marketLabel: dt.marketName, operatorKey: row.id,
          scorecardUrl: dt.href.startsWith("http") ? dt.href : `${base}${dt.href}`,
        });
      }
    }
    matchedPmSlugs.forEach((s) => allSlugs.add(s));
    lists.push({
      name: wl.name, ownerId: wl.ownerId, isShared: wl.isShared, organizationId: wl.organizationId,
      matchedPmSlugs, metaBySlug,
    });
  }
  return { lists, allSlugs: [...allSlugs] };
}

/** Preview: compose one digest from the first org that has changes and send
 *  only to `previewEmail`. Bypasses all gating + bookkeeping.
 *
 *  Diff window = latest vs the EARLIEST snapshot (widest available), NOT the
 *  narrow "since last notified" window a real recipient gets. A preview's job
 *  is to show representative, non-empty content for rendering + deliverability
 *  validation; two adjacent snapshots are often identical (no change to show),
 *  which would make the preview silently empty. The widest window almost always
 *  has real changes to render. */
async function runPreview(
  previewEmail: string, latest: Date, distinctDates: Date[], genVersions?: string[],
): Promise<DigestRunSummary> {
  const base = appBase();
  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  // distinctDates is newest-first; the last entry is the earliest snapshot.
  const prior = distinctDates.length > 1 ? distinctDates[distinctDates.length - 1] : null;
  const orgRows = await prisma.watchList.findMany({
    where: { organizationId: { not: null } }, distinct: ["organizationId"], select: { organizationId: true },
  });
  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    const ctx = await buildOrgListContext(organizationId, base);
    // SECURITY: preview is a diagnostic with no recipient identity (it
    // sends to a caller-supplied previewEmail, not an org member), so there's
    // no userId for visibleListsForMember to authorize against. Scope its
    // content to the org's SHARED lists only — never a private list — via
    // sharedListsOnly (digest-gather.ts).
    const previewLists = sharedListsOnly(ctx.lists);
    if (previewLists.length === 0) continue;
    const latestBySlug = await fetchSnapshotsAt(ctx.allSlugs, latest, genVersions);
    const priorBySlug = prior ? await fetchSnapshotsAt(ctx.allSlugs, prior, genVersions) : new Map<string, SnapshotRow>();
    const lists = previewLists
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
  // Restrict every snapshot read to the current estimator generation so a diff
  // never spans a methodology change (which would report recalibration as
  // spurious rating/portfolio moves — same class of bug as the trajectory).
  const genVersions = await currentDigestGenerationVersions();
  const distinctDates = await fetchSnapshotDates(genVersions); // newest-first
  if (distinctDates.length === 0) {
    return { snapshotDate: null, skipped: "no snapshots", recipients: 0, sent: 0, failed: 0, dryRun };
  }
  const latest = distinctDates[0];

  if (opts.previewEmail) {
    return runPreview(opts.previewEmail, latest, distinctDates, genVersions);
  }

  const deliveryRun = dryRun
    ? null
    : await startDigestRun(DIGEST_KIND.watchList, latest);

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

  let sent = 0, failed = 0, recipients = 0, orgErrors = 0, skippedClaims = 0;
  const claimedDeliveryIds: string[] = [];

  try {
  for (const { organizationId } of orgRows) {
    if (!organizationId) continue;
    // Isolate each org: one org's failure (e.g. a stale Clerk org that 404s in
    // listOrgMembers, or an entitlement lookup error) must NOT abort the whole
    // run and starve every OTHER org's members of their digest.
    try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId }, select: { id: true, clerkOrgId: true, excludeFromDigests: true },
    });
    if (!org?.clerkOrgId || org.excludeFromDigests) continue;

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
    const latestBySlug = await fetchSnapshotsAt(ctx.allSlugs, latest, genVersions);

    // Fetch prior snapshots grouped by the distinct prior dates among due
    // members (usually 1–2), not one fetch per recipient.
    const priorForUser = new Map<string, Date | null>();
    const priorByDate = new Map<number, Map<string, SnapshotRow>>();
    for (const m of dueMembers) {
      const p = prefByUser.get(m.userId);
      const prior = selectPriorForRecipient(latest, p?.lastNotifiedSnapshotDate ?? null, distinctDates);
      priorForUser.set(m.userId, prior);
      if (prior && !priorByDate.has(prior.getTime())) {
        priorByDate.set(prior.getTime(), await fetchSnapshotsAt(ctx.allSlugs, prior, genVersions));
      }
    }

    for (const m of dueMembers) {
      const prior = priorForUser.get(m.userId) ?? null;
      const priorBySlug = prior ? (priorByDate.get(prior.getTime()) ?? new Map<string, SnapshotRow>()) : new Map<string, SnapshotRow>();
      // SECURITY-CRITICAL (Task 8): ctx.lists is the org's FULL list set —
      // private lists included — evaluated once above with no per-member
      // gating. Every recipient's rendered digest MUST be built only from
      // the subset they're authorized to view: their own lists (private or
      // shared) plus the org's shared lists. Filter BEFORE buildListChanges
      // so a teammate's private list can never reach this member's email.
      const visibleLists = visibleListsForMember(ctx.lists, {
        userId: m.userId, organizationId: org.id,
      });
      const lists = visibleLists
        .map((c) => buildListChanges({
          watchListName: c.name, matchedPmSlugs: c.matchedPmSlugs,
          latestBySlug, priorBySlug, metaBySlug: c.metaBySlug,
        }))
        .filter((l) => l.operators.length > 0);
      const unsubscribeUrl = `${base}/api/digest/unsubscribe?u=${encodeURIComponent(m.userId)}&t=${signUnsubToken(m.userId)}`;
      const digest = buildDigest({
        recipientFirstName: null, monthLabel, lists,
        unsubscribeUrl,
        scorecardBaseUrl: base,
      });
      if (!digest) continue;
      recipients++;
      if (dryRun) { sent++; continue; }
      if (!deliveryRun) continue;
      const claim = await claimDigestDelivery({
        runId: deliveryRun.id,
        userId: m.userId,
        email: m.email,
      });
      if (!claim) {
        skippedClaims++;
        continue;
      }
      claimedDeliveryIds.push(claim.id);
      const result = await sendEmail({
        to: m.email,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
        unsubscribeUrl,
      });
      if (result.ok) sent++; else failed++;
      await completeDigestDelivery(
        claim.id,
        result.ok
          ? { status: "sent" }
          : { status: "failed" },
      );
      if (result.ok) {
        await prisma.digestPreference.upsert({
          where: { userId: m.userId },
          update: { lastNotifiedSnapshotDate: latest, lastDigestAt: now },
          create: { userId: m.userId, lastNotifiedSnapshotDate: latest, lastDigestAt: now },
        });
      }
    }
    } catch (err) {
      orgErrors++;
      console.error(
        `[cron/watch-list-digest] org ${organizationId} failed; skipping it`,
        err,
      );
      Sentry.captureException(err, {
        tags: { component: "watch-list-digest" },
        extra: { organizationId },
      });
    }
  }
  } finally {
    if (deliveryRun) {
      await finalizeDigestRun({
        runId: deliveryRun.id,
        claimedDeliveryIds,
        skipped: skippedClaims,
        forcedError: orgErrors > 0,
      });
    }
  }
  return { snapshotDate: latest.toISOString(), skipped: "", recipients, sent, failed, dryRun, orgErrors };
}
