import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { loadOwnerToday } from "@/lib/portfolio-iq/today.server";
import { buildOwnerTeamWorkQueue, type OwnerTeamWorkItem } from "@/lib/portfolio-iq/team";

export interface OwnerTeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  isCurrentUser: boolean;
  briefingEnabled: boolean;
  activeAssignments: number;
}

export async function loadOwnerTeam(input: { organizationId: string; userId: string; now?: Date }) {
  const today = await loadOwnerToday(input);
  if (!today) return null;
  const portfolio = today.portfolio;
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: portfolio.organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const memberRows = memberships.some((membership) => membership.userId === input.userId)
    ? memberships
    : [...memberships, { id: `preview-${input.userId}`, clerkMembershipId: `preview-${input.userId}`, organizationId: portfolio.organizationId, userId: input.userId, role: "org:admin", createdAt: new Date(0) }];
  const userIds = [...new Set(memberRows.map((membership) => membership.userId))];
  const [preferences, identityResult] = await Promise.all([
    prisma.portfolioIqDigestPreference.findMany({ where: { portfolioId: portfolio.id, userId: { in: userIds } } }),
    (async () => {
      const identities = new Map<string, { name: string; email: string }>();
      if (!userIds.length) return identities;
      try {
        const client = await clerkClient();
        const { data } = await client.users.getUserList({ userId: userIds, limit: userIds.length });
        for (const user of data) {
          const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
          const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
          identities.set(user.id, { name, email });
        }
      } catch {
        // A Clerk lookup failure never expands access. The tenant-scoped DB
        // membership remains authoritative and the UI falls back to "Team member".
      }
      return identities;
    })(),
  ]);
  const preferenceByUserId = new Map(preferences.map((preference) => [preference.userId, preference]));
  const signalById = new Map([...today.signals.filter((signal) => signal.decision), ...today.todaySignals].map((signal) => [signal.id, signal]));
  const workItems: OwnerTeamWorkItem[] = [...signalById.values()].map((signal) => ({
    signalId: signal.id,
    headline: signal.headline,
    severity: signal.severity,
    state: signal.decision?.state ?? "open",
    assignedUserId: signal.decision?.assignedUserId ?? null,
    assignedTo: signal.decision?.assignedTo ?? null,
    dueAt: signal.decision?.dueAt ?? null,
    assetNames: signal.exposures.length ? signal.exposures.map((exposure) => exposure.asset.name) : signal.asset ? [signal.asset.name] : [],
  }));
  const queue = buildOwnerTeamWorkQueue({ items: workItems, userId: input.userId, now: input.now ?? new Date() });
  const activeCountByUserId = new Map<string, number>();
  for (const item of workItems) if (item.state !== "resolved" && item.assignedUserId) activeCountByUserId.set(item.assignedUserId, (activeCountByUserId.get(item.assignedUserId) ?? 0) + 1);
  const members: OwnerTeamMember[] = memberRows.map((membership) => {
    const identity = identityResult.get(membership.userId);
    return {
      userId: membership.userId,
      name: identity?.name || (membership.userId === input.userId ? "You" : "Team member"),
      email: identity?.email ?? "",
      role: membership.role,
      isCurrentUser: membership.userId === input.userId,
      briefingEnabled: preferenceByUserId.get(membership.userId)?.enabled ?? false,
      activeAssignments: activeCountByUserId.get(membership.userId) ?? 0,
    };
  });
  return { portfolio, members, queue, currentPreference: preferenceByUserId.get(input.userId) ?? null };
}
