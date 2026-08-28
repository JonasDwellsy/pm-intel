import "server-only";

import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";

import { getMarketIqMarket } from "@/data/market-iq/markets";
import { sendEmail } from "@/lib/email/send";
import {
  buildMarketIqDailyWatchlistEmail,
  marketIqDailyDeliveryIsDue,
  parseMarketIqDailyDeliveryCadence,
  type MarketIqDailyDeliveryState,
  type MarketIqPersistedDailyMatch,
} from "@/lib/market-iq/daily-watchlist-delivery";
import { parseMarketIqDailyTriageStatus } from "@/lib/market-iq/daily-watchlist-triage";
import { loadMarketIqDailyEditionArchive } from "@/lib/market-iq/daily-editions.server";
import { buildMarketIqCompetitiveSetBrief } from "@/lib/market-iq/competitive-set-brief";
import {
  evaluateMarketIqCompetitiveSetSignalRule,
  parseMarketIqCompetitiveSetSignalRuleInput,
} from "@/lib/market-iq/competitive-set-signal-rules";
import {
  marketIqDailyWatchlistRecipientIds,
  matchMarketIqDailyWatchlist,
  parseMarketIqDailyWatchlistFilters,
} from "@/lib/market-iq/daily-watchlists";
import { prisma } from "@/lib/prisma";

export async function materializeMarketIqDailyWatchlistMatches() {
  const watchlists = await prisma.marketIqDailyWatchlist.findMany({
    include: { subscriptions: { select: { userId: true } } },
    orderBy: [{ marketId: "asc" }, { id: "asc" }],
  });
  const latestByMarket = new Map<string, Awaited<ReturnType<typeof loadMarketIqDailyEditionArchive>>["latest"]>();
  let created = 0;
  for (const watchlist of watchlists) {
    const market = getMarketIqMarket(watchlist.marketId);
    const filters = watchlist.version === 1 ? parseMarketIqDailyWatchlistFilters(watchlist.filters) : null;
    if (!market || market.status !== "live" || !filters) continue;
    if (!latestByMarket.has(market.id)) {
      const archive = await loadMarketIqDailyEditionArchive({ marketId: market.id, timeZone: market.timeZone });
      latestByMarket.set(market.id, archive.latest);
    }
    const edition = latestByMarket.get(market.id);
    const availability = edition?.value.marketActivity;
    if (!edition || availability?.state !== "available") continue;
    const matches = matchMarketIqDailyWatchlist({ filters }, availability.activity);
    const recipientUserIds = marketIqDailyWatchlistRecipientIds({
      ownerUserId: watchlist.userId,
      visibility: watchlist.visibility === "organization" ? "organization" : "private",
      subscriberUserIds: watchlist.subscriptions.map((subscription) => subscription.userId),
    });
    for (const match of matches) {
      const eventKey = `${match.eventType}:${match.id}`;
      const result = await prisma.marketIqDailyWatchlistMatch.createMany({
        data: recipientUserIds.map((recipientUserId) => ({
          organizationId: watchlist.organizationId,
          userId: recipientUserId,
          watchlistId: watchlist.id,
          marketId: watchlist.marketId,
          editionId: edition.id,
          eventKey,
          eventType: match.eventType,
          headline: match.headline,
          detail: match.detail,
          observedAt: new Date(match.observedAt),
          city: match.city,
          zip: match.zip,
          propertyManagerName: match.propertyManagerName,
          propertyId: match.propertyId,
          listingUrl: match.listingUrl,
          sectionHref: match.sectionHref,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    }
  }
  const signalRules = await prisma.marketIqCompetitiveSetSignalRule.findMany({
    where: { enabled: true },
    include: {
      watchlist: { include: { subscriptions: { select: { userId: true } } } },
    },
    orderBy: [{ watchlistId: "asc" }, { id: "asc" }],
  });
  const archiveByMarket = new Map<string, Awaited<ReturnType<typeof loadMarketIqDailyEditionArchive>>>();
  let signalsCreated = 0;
  for (const storedRule of signalRules) {
    const watchlist = storedRule.watchlist;
    const market = getMarketIqMarket(watchlist.marketId);
    const filters = watchlist.version === 1 ? parseMarketIqDailyWatchlistFilters(watchlist.filters) : null;
    const rule = parseMarketIqCompetitiveSetSignalRuleInput(storedRule);
    const canReceive = watchlist.userId === storedRule.userId
      || (watchlist.visibility === "organization"
        && watchlist.subscriptions.some((subscription) => subscription.userId === storedRule.userId));
    if (!market || market.status !== "live" || !filters?.competitiveSet || !rule.ok || !canReceive) continue;
    if (!archiveByMarket.has(market.id)) {
      archiveByMarket.set(market.id, await loadMarketIqDailyEditionArchive({
        marketId: market.id,
        timeZone: market.timeZone,
        recentLimit: 16,
      }));
    }
    const archive = archiveByMarket.get(market.id)!;
    const edition = archive.latest;
    if (!edition) continue;
    const brief = buildMarketIqCompetitiveSetBrief({
      watchlist: {
        id: watchlist.id,
        name: watchlist.name,
        marketId: watchlist.marketId,
        filters,
        visibility: watchlist.visibility === "organization" ? "organization" : "private",
        isOwner: watchlist.userId === storedRule.userId,
        isFollowing: true,
        createdAt: watchlist.createdAt.toISOString(),
        updatedAt: watchlist.updatedAt.toISOString(),
      },
      editions: archive.recent,
    });
    const evaluation = evaluateMarketIqCompetitiveSetSignalRule({ rule: rule.value, brief });
    if (evaluation.state !== "triggered") continue;
    const evidenceKeys = evaluation.evidence.map((event) => event.key).sort();
    const evidenceDigest = createHash("sha256").update(evidenceKeys.join("|")).digest("hex").slice(0, 24);
    const latestEvidence = evaluation.evidence.find((event) => event.observedAt === evaluation.observedAt)
      ?? evaluation.evidence[0];
    const result = await prisma.marketIqDailyWatchlistMatch.createMany({
      data: [{
        organizationId: storedRule.organizationId,
        userId: storedRule.userId,
        watchlistId: watchlist.id,
        marketId: watchlist.marketId,
        editionId: edition.id,
        eventKey: `competitive_signal:${storedRule.id}:${evidenceDigest}`,
        eventType: storedRule.eventType,
        headline: evaluation.headline,
        detail: evaluation.detail,
        observedAt: new Date(evaluation.observedAt),
        city: latestEvidence?.city ?? market.name,
        zip: latestEvidence?.zip ?? "",
        propertyManagerName: null,
        propertyId: null,
        listingUrl: null,
        sectionHref: "#competitive-set-timeline",
        destinationHref: `/market-iq/competitive-sets/${encodeURIComponent(watchlist.id)}`,
        matchKind: "competitive_signal",
        evidenceEventKeys: JSON.stringify(evidenceKeys),
        evidenceCount: evidenceKeys.length,
        windowStartAt: new Date(evaluation.windowStartAt),
        windowEndAt: new Date(evaluation.windowEndAt),
        signalRuleId: storedRule.id,
      }],
      skipDuplicates: true,
    });
    signalsCreated += result.count;
  }
  return {
    watchlistsEvaluated: watchlists.length,
    signalRulesEvaluated: signalRules.length,
    matchesCreated: created + signalsCreated,
    signalsCreated,
  };
}

async function userIdentities(userIds: string[]) {
  const identities = new Map<string, { firstName: string | null; name: string; email: string }>();
  if (!userIds.length) return identities;
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ userId: userIds, limit: Math.min(userIds.length, 500) });
  for (const user of data) {
    const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || email || "Team member";
    if (email) identities.set(user.id, { firstName: user.firstName ?? null, name, email });
  }
  return identities;
}

export async function runMarketIqDailyWatchlistDelivery(input: { now?: Date; appOrigin?: string } = {}) {
  const now = input.now ?? new Date();
  const materialized = await materializeMarketIqDailyWatchlistMatches();
  const preferences = await prisma.marketIqDailyDeliveryPreference.findMany({
    where: { cadence: { in: ["daily", "weekly"] }, organization: { excludeFromDigests: false } },
    orderBy: [{ organizationId: "asc" }, { userId: "asc" }],
  });
  const due = preferences.filter((preference) => {
    const cadence = parseMarketIqDailyDeliveryCadence(preference.cadence);
    return cadence ? marketIqDailyDeliveryIsDue({ cadence, lastDeliveredAt: preference.lastDeliveredAt, now }) : false;
  });
  const identities = await userIdentities([...new Set(due.map((preference) => preference.userId))]);
  const counts = { eligible: due.length, sent: 0, failed: 0, empty: 0, missingEmail: 0 };
  const origin = (input.appOrigin ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://market-iq-git-codex-market-iq-integration-dwellsybordo.vercel.app").replace(/\/$/, "");

  for (const preference of due) {
    const cadence = parseMarketIqDailyDeliveryCadence(preference.cadence);
    const identity = identities.get(preference.userId);
    if (cadence !== "daily" && cadence !== "weekly") continue;
    if (!identity) { counts.missingEmail += 1; continue; }
    const rows = await prisma.marketIqDailyWatchlistMatch.findMany({
      where: {
        organizationId: preference.organizationId,
        userId: preference.userId,
        emailedAt: null,
        watchlist: {
          OR: [
            { userId: preference.userId },
            { visibility: "organization", subscriptions: { some: { userId: preference.userId } } },
          ],
        },
        ...(preference.lastDeliveredAt ? {
          OR: [
            { matchKind: "competitive_signal", createdAt: { gt: preference.lastDeliveredAt } },
            { matchKind: "event", observedAt: { gt: preference.lastDeliveredAt } },
          ],
        } : {}),
      },
      include: { watchlist: { select: { name: true } } },
      orderBy: { observedAt: "desc" },
      take: 200,
    });
    const matches: MarketIqPersistedDailyMatch[] = rows.map((row) => ({
      id: row.id,
      watchlistName: row.watchlist.name,
      marketId: row.marketId,
      editionId: row.editionId,
      eventKey: row.eventKey,
      eventType: row.eventType,
      headline: row.headline,
      detail: row.detail,
      observedAt: row.observedAt,
      propertyId: row.propertyId,
      sectionHref: row.sectionHref,
      destinationHref: row.destinationHref,
      matchKind: row.matchKind === "competitive_signal" ? "competitive_signal" : "event",
      evidenceCount: row.evidenceCount,
      windowStartAt: row.windowStartAt,
      windowEndAt: row.windowEndAt,
    }));
    const email = buildMarketIqDailyWatchlistEmail({ recipientName: identity.firstName, cadence, matches, appOrigin: origin });
    if (!email) { counts.empty += 1; continue; }
    const deliveryKey = createHash("sha256").update(`${preference.organizationId}:${preference.userId}:${email.eventKeys.sort().join("|")}`).digest("hex");
    const prior = await prisma.marketIqDailyWatchlistDelivery.findUnique({ where: { deliveryKey } });
    if (prior?.status === "sent") continue;
    const delivery = prior
      ? await prisma.marketIqDailyWatchlistDelivery.update({ where: { id: prior.id }, data: { status: "sending", error: null } })
      : await prisma.marketIqDailyWatchlistDelivery.create({ data: { organizationId: preference.organizationId, userId: preference.userId, deliveryKey, cadence, recipientEmail: identity.email, matchCount: email.eventCount, eventKeys: JSON.stringify(email.eventKeys) } });
    const result = await sendEmail({ to: identity.email, fromName: "Dwellsy Market IQ", subject: email.subject, html: email.html, text: email.text, customArgs: { product: "market_iq", delivery_id: delivery.id } });
    if (!result.ok) {
      counts.failed += 1;
      await prisma.marketIqDailyWatchlistDelivery.update({ where: { id: delivery.id }, data: { status: "failed", error: result.error.slice(0, 1_000) } });
      continue;
    }
    const deliveredKeys = new Set(email.eventKeys);
    await prisma.$transaction([
      prisma.marketIqDailyWatchlistDelivery.update({ where: { id: delivery.id }, data: { status: "sent", providerId: result.id, sentAt: now } }),
      prisma.marketIqDailyWatchlistMatch.updateMany({ where: { id: { in: rows.filter((row) => deliveredKeys.has(row.eventKey)).map((row) => row.id) }, emailedAt: null }, data: { emailedAt: now } }),
      prisma.marketIqDailyDeliveryPreference.update({ where: { id: preference.id }, data: { lastDeliveredAt: now } }),
    ]);
    counts.sent += 1;
  }
  return { ...materialized, ...counts };
}

export async function loadMarketIqDailyDeliveryState(input: { organizationId: string; userId: string }): Promise<MarketIqDailyDeliveryState> {
  const [preference, matches, memberships] = await Promise.all([
    prisma.marketIqDailyDeliveryPreference.findUnique({ where: { organizationId_userId: input } }),
    prisma.marketIqDailyWatchlistMatch.findMany({
      where: {
        ...input,
        watchlist: { OR: [{ userId: input.userId }, { visibility: "organization" }] },
      },
      include: { watchlist: { select: { name: true, visibility: true, userId: true } } },
      orderBy: { observedAt: "desc" },
      take: 30,
    }),
    prisma.organizationMembership.findMany({
      where: { organizationId: input.organizationId },
      select: { userId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const triages = matches.length ? await prisma.marketIqDailyWatchlistTriage.findMany({
    where: {
      organizationId: input.organizationId,
      OR: matches.map((match) => ({ watchlistId: match.watchlistId, eventKey: match.eventKey })),
    },
    include: { notes: { orderBy: { createdAt: "desc" }, take: 20 } },
  }) : [];
  const userIds = [...new Set([
    input.userId,
    ...memberships.map((membership) => membership.userId),
    ...matches.map((match) => match.watchlist.userId),
    ...triages.flatMap((triage) => [triage.assignedToUserId, triage.updatedByUserId, ...triage.notes.map((note) => note.authorUserId)]).filter((userId): userId is string => Boolean(userId)),
  ])];
  const identities = await userIdentities(userIds);
  const triageByMatch = new Map(triages.map((triage) => [`${triage.watchlistId}:${triage.eventKey}`, triage]));
  return {
    cadence: parseMarketIqDailyDeliveryCadence(preference?.cadence) ?? "in_app_only",
    lastDeliveredAt: preference?.lastDeliveredAt?.toISOString() ?? null,
    viewerUserId: input.userId,
    teamMembers: userIds.map((userId) => ({ userId, name: identities.get(userId)?.name ?? (userId === input.userId ? "You" : "Team member") })),
    matches: matches.map((match) => {
      const triage = triageByMatch.get(`${match.watchlistId}:${match.eventKey}`);
      return {
      id: match.id,
      watchlistName: match.watchlist.name,
      marketId: match.marketId,
      editionId: match.editionId,
      eventKey: match.eventKey,
      eventType: match.eventType,
      headline: match.headline,
      detail: match.detail,
      observedAt: match.observedAt.toISOString(),
      propertyId: match.propertyId,
      sectionHref: match.sectionHref,
      destinationHref: match.destinationHref,
      matchKind: match.matchKind === "competitive_signal" ? "competitive_signal" as const : "event" as const,
      evidenceCount: match.evidenceCount,
      windowStartAt: match.windowStartAt?.toISOString() ?? null,
      windowEndAt: match.windowEndAt?.toISOString() ?? null,
      readAt: match.readAt?.toISOString() ?? null,
      emailedAt: match.emailedAt?.toISOString() ?? null,
      watchlistVisibility: match.watchlist.visibility === "organization" ? "organization" as const : "private" as const,
      triage: {
        status: parseMarketIqDailyTriageStatus(triage?.status) ?? "new",
        assignedToUserId: triage?.assignedToUserId ?? null,
        notes: triage?.notes.map((note) => ({
          id: note.id,
          authorUserId: note.authorUserId,
          authorName: identities.get(note.authorUserId)?.name ?? (note.authorUserId === input.userId ? "You" : "Team member"),
          body: note.body,
          createdAt: note.createdAt.toISOString(),
        })) ?? [],
      },
    }; }),
  };
}
