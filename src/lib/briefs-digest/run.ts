// Market-brief digest orchestration (impure: Prisma + Clerk + SendGrid). Mirrors
// the watch-list digest-run, but:
//   - its own per-user prefs (BriefDigestPreference) — independent opt-out/cadence,
//   - deterministic content (change counts + links, no LLM in the cron path),
//   - one all-snapshot load, grouped per market + nationally, reused across recipients.
// Per-recipient gate: subscribed + new snapshot since last notified + cadence
// throttle. Idempotency = BriefDigestPreference.lastNotifiedSnapshotDate (no
// Run/Send tables — a mid-run crash simply re-sends only the not-yet-stamped).
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";
import { toSnapshotRow, type SnapshotRow } from "@/lib/watch-list/snapshot";
import { keepCurrentGenerationSnapshots } from "@/lib/operators/trajectory";
import { isDigestDue, parseCadence } from "@/lib/watch-list/digest-gather";
import { fetchSnapshotDates } from "@/lib/watch-list/digest-run";
import {
  buildMarketChangeSummary,
  type MarketChangeSummary,
  type OperatorMeta,
} from "@/lib/market-brief-changes";
import { getEntitledMarketIds, isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { readCachedNationalHeadline } from "@/lib/national-brief-prose";
import { sendEmail } from "@/lib/email/send";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";
import {
  buildBriefDigestEmail,
  type BriefDigestChangeCounts,
  type BriefDigestMarketLine,
} from "./compose";
import { signBriefUnsubToken } from "./unsubscribe";

export interface BriefDigestRunSummary {
  snapshotDate: string | null;
  skipped?: string;
  recipients: number;
  sent: number;
  failed: number;
  dryRun: boolean;
}

function appBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_BASE_URL ??
    "https://intel.iq.dwellsy.com"
  ).replace(/\/$/, "");
}

async function listOrgMembers(clerkOrgId: string): Promise<{ userId: string; email: string }[]> {
  const client = await clerkClient();
  const res = await client.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
    limit: 100,
  });
  const out: { userId: string; email: string }[] = [];
  for (const m of res.data) {
    const uid = m.publicUserData?.userId;
    const email = m.publicUserData?.identifier;
    if (uid && email) out.push({ userId: uid, email });
  }
  return out;
}

function counts(c: MarketChangeSummary | null): BriefDigestChangeCounts {
  return {
    newEntrants: c?.newEntrants.length ?? 0,
    ratingGains: c?.ratingUp.length ?? 0,
    ratingLosses: c?.ratingDown.length ?? 0,
    cohortMoves: c?.cohortMoves.length ?? 0,
  };
}

/** Load all snapshots once; per-operator latest/prior; group by market. Returns
 *  a national change summary + per-marketId change summaries + display meta. */
async function computeChanges(): Promise<{
  national: MarketChangeSummary | null;
  byMarket: Map<string, MarketChangeSummary | null>;
  markets: Map<string, { marketName: string; briefUrl: string }>;
} | null> {
  // Only the current estimator generation — never diff a v0.7 snapshot against a
  // v0.6.4 one, which would report methodology recalibration as spurious rating
  // changes (same class of bug as the operator trajectory; see
  // keepCurrentGenerationSnapshots).
  const snaps = keepCurrentGenerationSnapshots(
    await prisma.operatorSnapshot.findMany({
      orderBy: [{ pmSlug: "asc" }, { snapshotDate: "desc" }],
    })
  );
  if (snaps.length === 0) return null;

  const currentBySlug = new Map<string, SnapshotRow>();
  const priorBySlug = new Map<string, SnapshotRow>();
  const seen = new Map<string, number>();
  for (const s of snaps) {
    const n = seen.get(s.pmSlug) ?? 0;
    if (n === 0) currentBySlug.set(s.pmSlug, toSnapshotRow(s));
    else if (n === 1) priorBySlug.set(s.pmSlug, toSnapshotRow(s));
    seen.set(s.pmSlug, n + 1);
  }
  const pairedSlugs = [...currentBySlug.keys()].filter((s) => priorBySlug.has(s));
  if (pairedSlugs.length === 0) return null;

  const marketRows = await prisma.market.findMany({
    select: { id: true, fullName: true, state: true, city: true },
  });
  const markets = new Map(
    marketRows.map((m) => [
      m.id,
      {
        marketName: m.fullName,
        briefUrl: `${appBase()}/property-managers/${stateCodeToSlug(m.state)}/${citySlug(m.city)}/brief`,
      },
    ]),
  );

  const pms = await prisma.pM.findMany({
    where: { slug: { in: pairedSlugs } },
    select: { slug: true, name: true, marketId: true },
  });
  const meta = new Map<string, OperatorMeta>();
  const slugsByMarket = new Map<string, string[]>();
  for (const p of pms) {
    const m = markets.get(p.marketId);
    meta.set(p.slug, {
      name: p.name,
      scorecardUrl: m ? `${m.briefUrl.replace(/\/brief$/, "")}/${p.slug}` : `#${p.slug}`,
    });
    const arr = slugsByMarket.get(p.marketId) ?? [];
    arr.push(p.slug);
    slugsByMarket.set(p.marketId, arr);
  }

  const national = buildMarketChangeSummary(
    pairedSlugs.map((s) => priorBySlug.get(s)!),
    pairedSlugs.map((s) => currentBySlug.get(s)!),
    meta,
  );

  const byMarket = new Map<string, MarketChangeSummary | null>();
  for (const [marketId, slugs] of slugsByMarket) {
    byMarket.set(
      marketId,
      buildMarketChangeSummary(
        slugs.map((s) => priorBySlug.get(s)!),
        slugs.map((s) => currentBySlug.get(s)!),
        meta,
      ),
    );
  }
  return { national, byMarket, markets };
}

export async function runBriefDigest(opts: {
  mode: "send" | "dryRun";
  previewEmail?: string;
}): Promise<BriefDigestRunSummary> {
  const dryRun = opts.mode === "dryRun";
  const now = new Date();
  const dates = await fetchSnapshotDates(); // newest-first
  if (dates.length === 0) {
    return { snapshotDate: null, skipped: "no snapshots", recipients: 0, sent: 0, failed: 0, dryRun };
  }
  const latest = dates[0];
  const monthLabel = latest.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const base = appBase();

  const changes = await computeChanges();
  if (!changes) {
    return { snapshotDate: latest.toISOString().slice(0, 10), skipped: "no paired snapshots", recipients: 0, sent: 0, failed: 0, dryRun };
  }
  const nationalHeadline = await readCachedNationalHeadline();
  const nationalCounts = counts(changes.national);

  const marketLine = (marketId: string): BriefDigestMarketLine | null => {
    const m = changes.markets.get(marketId);
    if (!m) return null;
    const c = counts(changes.byMarket.get(marketId) ?? null);
    return { marketName: m.marketName, briefUrl: m.briefUrl, ...c };
  };

  // Preview: one fully-rendered digest to an address, ignoring gating/entitlement.
  if (opts.previewEmail) {
    const markets = [...changes.markets.keys()]
      .map(marketLine)
      .filter((x): x is BriefDigestMarketLine => !!x)
      .filter((m) => m.newEntrants + m.ratingGains + m.ratingLosses + m.cohortMoves > 0)
      .slice(0, 12);
    const email = buildBriefDigestEmail({
      recipientFirstName: null,
      monthLabel,
      nationalUrl: `${base}/briefs/national`,
      nationalHeadline,
      national: nationalCounts,
      markets,
      unsubscribeUrl: `${base}/api/brief-digest/unsubscribe?u=preview&t=preview`,
    });
    if (!email) return { snapshotDate: latest.toISOString().slice(0, 10), skipped: "empty", recipients: 0, sent: 0, failed: 0, dryRun };
    const r = await sendEmail({ to: opts.previewEmail, subject: `[preview] ${email.subject}`, html: email.html, text: email.text });
    return { snapshotDate: latest.toISOString().slice(0, 10), recipients: 1, sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, dryRun };
  }

  const prefByUser = new Map(
    (await prisma.briefDigestPreference.findMany()).map((p) => [p.userId, p]),
  );
  const orgs = await prisma.organization.findMany({
    where: { personalForUserId: null, clerkOrgId: { not: "" }, excludeFromDigests: false },
    select: { id: true, clerkOrgId: true },
  });

  let sent = 0, failed = 0, recipients = 0;
  const emailedThisRun = new Set<string>();

  for (const org of orgs) {
    const entitlement = await getEntitledMarketIds(org.id);
    // The org's entitled markets, with any change, as digest lines.
    const orgMarketLines = [...changes.markets.keys()]
      .filter((mid) => isMarketEntitled(entitlement, mid))
      .map(marketLine)
      .filter((x): x is BriefDigestMarketLine => !!x)
      .filter((m) => m.newEntrants + m.ratingGains + m.ratingLosses + m.cohortMoves > 0)
      .sort((a, b) =>
        b.newEntrants + b.ratingGains + b.ratingLosses + b.cohortMoves -
        (a.newEntrants + a.ratingGains + a.ratingLosses + a.cohortMoves))
      .slice(0, 12);

    const members = await listOrgMembers(org.clerkOrgId);
    for (const m of members) {
      if (emailedThisRun.has(m.userId)) continue;
      const p = prefByUser.get(m.userId);
      const due = isDigestDue({
        unsubscribed: p?.unsubscribed ?? false,
        cadence: parseCadence(p?.cadence) ?? "monthly",
        latest,
        lastNotifiedSnapshotDate: p?.lastNotifiedSnapshotDate ?? null,
        lastDigestAt: p?.lastDigestAt ?? null,
        now,
      });
      if (!due) continue;

      const email = buildBriefDigestEmail({
        recipientFirstName: null,
        monthLabel,
        nationalUrl: `${base}/briefs/national`,
        nationalHeadline,
        national: nationalCounts,
        markets: orgMarketLines,
        unsubscribeUrl: `${base}/api/brief-digest/unsubscribe?u=${encodeURIComponent(m.userId)}&t=${signBriefUnsubToken(m.userId)}`,
      });
      if (!email) continue;
      recipients++;
      emailedThisRun.add(m.userId);
      if (dryRun) { sent++; continue; }

      const r = await sendEmail({ to: m.email, subject: email.subject, html: email.html, text: email.text });
      if (r.ok) {
        sent++;
        await prisma.briefDigestPreference.upsert({
          where: { userId: m.userId },
          update: { lastNotifiedSnapshotDate: latest, lastDigestAt: now },
          create: { userId: m.userId, lastNotifiedSnapshotDate: latest, lastDigestAt: now },
        });
      } else {
        failed++;
      }
    }
  }

  return { snapshotDate: latest.toISOString().slice(0, 10), recipients, sent, failed, dryRun };
}
