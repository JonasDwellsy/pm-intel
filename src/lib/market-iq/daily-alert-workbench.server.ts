import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";

import { getMarketIqMarket } from "@/data/market-iq/markets";
import type { MarketIqAlertWorkbenchState } from "@/lib/market-iq/daily-alert-workbench";
import { parseMarketIqDailyTriageStatus } from "@/lib/market-iq/daily-watchlist-triage";
import { parseMarketIqDailyWatchlistFilters } from "@/lib/market-iq/daily-watchlists";
import { prisma } from "@/lib/prisma";

const WORKBENCH_LIMIT = 500;

function triageKey(input: { watchlistId: string; eventKey: string }) {
  return `${input.watchlistId}:${input.eventKey}`;
}

async function userNames(userIds: string[]) {
  const names = new Map<string, string>();
  if (!userIds.length) return names;
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ userId: userIds, limit: Math.min(userIds.length, 500) });
  for (const user of data) {
    const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress
      ?? user.emailAddresses[0]?.emailAddress;
    names.set(user.id, [user.firstName, user.lastName].filter(Boolean).join(" ") || email || "Team member");
  }
  return names;
}

function visibleMatchWhere(input: { organizationId: string; userId: string; marketIds: string[] }) {
  return {
    organizationId: input.organizationId,
    userId: input.userId,
    marketId: { in: input.marketIds },
    watchlist: { OR: [{ userId: input.userId }, { visibility: "organization" }] },
  };
}

export async function loadMarketIqAlertWorkbench(input: {
  organizationId: string;
  userId: string;
  marketIds: string[];
}): Promise<MarketIqAlertWorkbenchState> {
  if (!input.marketIds.length) return { viewerUserId: input.userId, teamMembers: [], items: [], truncated: false };
  const [matches, memberships] = await Promise.all([
    prisma.marketIqDailyWatchlistMatch.findMany({
      where: visibleMatchWhere(input),
      include: { watchlist: { select: { id: true, name: true, visibility: true, userId: true, version: true, filters: true } } },
      orderBy: { observedAt: "desc" },
      take: WORKBENCH_LIMIT + 1,
    }),
    prisma.organizationMembership.findMany({
      where: { organizationId: input.organizationId },
      select: { userId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const visibleMatches = matches.slice(0, WORKBENCH_LIMIT);
  const triages = visibleMatches.length ? await prisma.marketIqDailyWatchlistTriage.findMany({
    where: {
      organizationId: input.organizationId,
      OR: visibleMatches.map((match) => ({ watchlistId: match.watchlistId, eventKey: match.eventKey })),
    },
    include: { notes: { orderBy: { createdAt: "desc" }, take: 20 } },
  }) : [];
  const memberIds = [...new Set([input.userId, ...memberships.map((membership) => membership.userId)])];
  const identityIds = [...new Set([
    ...memberIds,
    ...visibleMatches.map((match) => match.watchlist.userId),
    ...triages.flatMap((triage) => [
      triage.assignedToUserId,
      triage.updatedByUserId,
      ...triage.notes.map((note) => note.authorUserId),
    ]).filter((userId): userId is string => Boolean(userId)),
  ])];
  const names = await userNames(identityIds);
  const triageByMatch = new Map(triages.map((triage) => [triageKey(triage), triage]));

  return {
    viewerUserId: input.userId,
    teamMembers: memberIds.map((userId) => ({
      userId,
      name: names.get(userId) ?? (userId === input.userId ? "You" : "Team member"),
    })),
    truncated: matches.length > WORKBENCH_LIMIT,
    items: visibleMatches.map((match) => {
      const triage = triageByMatch.get(triageKey(match));
      const watchlistFilters = match.watchlist.version === 1 ? parseMarketIqDailyWatchlistFilters(match.watchlist.filters) : null;
      return {
        id: match.id,
        watchlistId: match.watchlistId,
        watchlistName: match.watchlist.name,
        watchlistVisibility: match.watchlist.visibility === "organization" ? "organization" as const : "private" as const,
        marketId: match.marketId,
        marketName: getMarketIqMarket(match.marketId)?.shortLabel ?? match.marketId,
        editionId: match.editionId,
        eventKey: match.eventKey,
        eventType: match.eventType,
        headline: match.headline,
        detail: match.detail,
        observedAt: match.observedAt.toISOString(),
        city: match.city,
        propertyManagerName: match.propertyManagerName,
        propertyId: match.propertyId,
        competitiveSetHref: watchlistFilters?.competitiveSet ? `/market-iq/competitive-sets/${encodeURIComponent(match.watchlistId)}` : null,
        sectionHref: match.sectionHref,
        readAt: match.readAt?.toISOString() ?? null,
        emailedAt: match.emailedAt?.toISOString() ?? null,
        triage: {
          status: parseMarketIqDailyTriageStatus(triage?.status) ?? "new",
          assignedToUserId: triage?.assignedToUserId ?? null,
          notes: triage?.notes.map((note) => ({
            id: note.id,
            authorUserId: note.authorUserId,
            authorName: names.get(note.authorUserId) ?? (note.authorUserId === input.userId ? "You" : "Team member"),
            body: note.body,
            createdAt: note.createdAt.toISOString(),
          })) ?? [],
        },
      };
    }),
  };
}

export async function loadMarketIqOpenAlertCount(input: {
  organizationId: string;
  userId: string;
  marketIds: string[];
}) {
  if (!input.marketIds.length) return 0;
  const rows = await prisma.$queryRaw<Array<{ count: number | bigint }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "count"
    FROM "MarketIqDailyWatchlistMatch" AS match
    INNER JOIN "MarketIqDailyWatchlist" AS watchlist
      ON watchlist."id" = match."watchlistId"
    LEFT JOIN "MarketIqDailyWatchlistTriage" AS triage
      ON triage."organizationId" = match."organizationId"
      AND triage."watchlistId" = match."watchlistId"
      AND triage."eventKey" = match."eventKey"
    WHERE match."organizationId" = ${input.organizationId}
      AND match."userId" = ${input.userId}
      AND match."marketId" IN (${Prisma.join(input.marketIds)})
      AND (watchlist."userId" = ${input.userId} OR watchlist."visibility" = 'organization')
      AND (triage."status" IS NULL OR triage."status" NOT IN ('dismissed', 'resolved'))
  `);
  return Number(rows[0]?.count ?? 0);
}
