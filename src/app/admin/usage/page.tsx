// v0.24 — Admin → Usage.
//
// First-party, internal usage analytics read straight from our own Neon
// DB (the UsageEvent table) — no third-party. Answers the questions a
// Dwellsy admin actually asks: who logged in and when, per-client active
// users, which operators/markets get viewed, and watch-list / AI activity.
//
// PRIVACY: the UsageEvent log stores Clerk IDs ONLY. Display names are
// resolved HERE, at read time:
//   - userId  → name/email via Clerk clerkClient().users.getUserList
//   - orgId   → org name via the Organization mirror table (Prisma)
//   - login attribution → the OrganizationMembership mirror (logins carry
//     no orgId, so a login is attributed to the org(s) the user belongs to)
//
// Auth: gated by src/app/admin/layout.tsx (auth + isAdminUser → notFound).
// All the async work + rollup lives in loadUsageData(); the component just
// renders — matching the loadOrganizations()/loadMarkets() pattern used by
// the other admin pages (and keeping impure calls like Date.now out of the
// component render body).

import type { Metadata } from "next";
import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { citySlug, stateCodeToSlug } from "@/lib/slugify";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // robots noindex inherited from src/app/admin/layout.tsx
  title: "Admin · Usage",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LOGIN_LIMIT = 25;
const RECENT_ACTIVITY_LIMIT = 15;
const TOP_N = 15;
// Bound the in-memory window pull. Generous for the current stage; if the
// table ever outgrows this, the sections move to SQL groupBy.
const WINDOW_EVENT_CAP = 20000;

interface Identity {
  name: string;
  email: string;
}

interface OrgRow {
  clerkOrgId: string;
  name: string | null;
  active7: number;
  active30: number;
  events30: number;
  logins7: number;
  logins30: number;
}

interface OperatorMeta {
  name: string;
  sub: string;
  href: string;
}

interface RecentLoginRow {
  id: string;
  userId: string;
  occurredAt: Date;
}

interface ActivityEventRow {
  id: string;
  userId: string;
  orgId: string | null;
  occurredAt: Date;
}

interface UsageData {
  orgRows: OrgRow[];
  recentLogins: RecentLoginRow[];
  topOperators: Array<[string, number]>;
  topMarkets: Array<[string, number]>;
  recentWatchListCreates: ActivityEventRow[];
  recentAskQueries: ActivityEventRow[];
  wlCreated7: number;
  wlCreated30: number;
  ask7: number;
  ask30: number;
  totalLogins7: number;
  totalActive30: number;
  identityByUserId: Map<string, Identity>;
  userToOrgs: Map<string, Array<{ clerkOrgId: string; name: string }>>;
  orgNameByClerkId: Map<string, string>;
  operatorNameBySlug: Map<string, OperatorMeta>;
  marketNameById: Map<string, string>;
}

function fmtDateTime(d: Date): string {
  // "2026-07-15 14:32 UTC" — compact, timezone-explicit.
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Best-effort display label for a resolved (or unresolved) user. */
function userLabel(id: Identity | undefined): { primary: string; secondary: string | null } {
  if (!id) return { primary: "", secondary: null };
  if (id.name) return { primary: id.name, secondary: id.email || null };
  if (id.email) return { primary: id.email, secondary: null };
  return { primary: "", secondary: null };
}

async function loadUsageData(): Promise<UsageData> {
  const now = Date.now();
  const since7 = new Date(now - 7 * DAY_MS);
  const since30 = new Date(now - 30 * DAY_MS);

  // Two reads: the latest logins (any age, so this list is never empty
  // just because logins are older than the window) + every event in the
  // last 30 days for the rollups.
  const [recentLogins, events30] = await Promise.all([
    prisma.usageEvent.findMany({
      where: { eventName: "login" },
      orderBy: { occurredAt: "desc" },
      take: RECENT_LOGIN_LIMIT,
    }),
    prisma.usageEvent.findMany({
      where: { occurredAt: { gte: since30 } },
      orderBy: { occurredAt: "desc" },
      take: WINDOW_EVENT_CAP,
    }),
  ]);

  // ── Per-org rollup: active users (7/30d) from org-tagged events.
  interface OrgAgg {
    active7: Set<string>;
    active30: Set<string>;
    events30: number;
    logins7: number;
    logins30: number;
  }
  const orgAgg = new Map<string, OrgAgg>();
  const getOrg = (clerkOrgId: string): OrgAgg => {
    let a = orgAgg.get(clerkOrgId);
    if (!a) {
      a = { active7: new Set(), active30: new Set(), events30: 0, logins7: 0, logins30: 0 };
      orgAgg.set(clerkOrgId, a);
    }
    return a;
  };
  for (const e of events30) {
    if (!e.orgId) continue; // login + org-less events don't count toward an org
    const a = getOrg(e.orgId);
    a.active30.add(e.userId);
    a.events30 += 1;
    if (e.occurredAt >= since7) a.active7.add(e.userId);
  }

  // ── Login attribution. Logins carry no orgId (session.created has no
  // org), so attribute each login to the org(s) the user belongs to via
  // the OrganizationMembership mirror.
  const loginEvents30 = events30.filter((e) => e.eventName === "login");
  const loginUserIds = Array.from(
    new Set([...recentLogins, ...loginEvents30].map((e) => e.userId))
  );
  const userToOrgs = new Map<string, Array<{ clerkOrgId: string; name: string }>>();
  if (loginUserIds.length > 0) {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: { in: loginUserIds } },
      select: {
        userId: true,
        organization: { select: { clerkOrgId: true, name: true } },
      },
    });
    for (const m of memberships) {
      const arr = userToOrgs.get(m.userId) ?? [];
      arr.push({ clerkOrgId: m.organization.clerkOrgId, name: m.organization.name });
      userToOrgs.set(m.userId, arr);
    }
  }
  for (const e of loginEvents30) {
    for (const o of userToOrgs.get(e.userId) ?? []) {
      const a = getOrg(o.clerkOrgId);
      a.logins30 += 1;
      if (e.occurredAt >= since7) a.logins7 += 1;
    }
  }

  // ── Most-viewed operators (scorecard_view) + markets (market_view).
  const operatorCounts = new Map<string, number>();
  const marketCounts = new Map<string, number>();
  for (const e of events30) {
    if (e.eventName === "scorecard_view" && e.targetSlug) {
      operatorCounts.set(e.targetSlug, (operatorCounts.get(e.targetSlug) ?? 0) + 1);
    } else if (e.eventName === "market_view" && e.targetSlug) {
      marketCounts.set(e.targetSlug, (marketCounts.get(e.targetSlug) ?? 0) + 1);
    }
  }
  const topOperators = [...operatorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);
  const topMarkets = [...marketCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);

  // ── Activity: watch-list creates + AI queries.
  const watchListCreates = events30.filter((e) => e.eventName === "watch_list_create");
  const askQueries = events30.filter((e) => e.eventName === "ask_query");
  const recentWatchListCreates = watchListCreates.slice(0, RECENT_ACTIVITY_LIMIT);
  const recentAskQueries = askQueries.slice(0, RECENT_ACTIVITY_LIMIT);
  const countIn7 = (list: typeof events30) =>
    list.filter((e) => e.occurredAt >= since7).length;

  // ── Resolve display names (batched). userId → Clerk; orgId → mirror;
  // operator slug → PM; market id → Market.
  const userIdsToResolve = Array.from(
    new Set([
      ...recentLogins.map((e) => e.userId),
      ...recentWatchListCreates.map((e) => e.userId),
      ...recentAskQueries.map((e) => e.userId),
    ])
  );
  const identityByUserId = new Map<string, Identity>();
  if (userIdsToResolve.length > 0) {
    try {
      const client = await clerkClient();
      const { data } = await client.users.getUserList({
        userId: userIdsToResolve,
        limit: userIdsToResolve.length,
      });
      for (const u of data) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
        const email =
          u.emailAddresses.find((x) => x.id === u.primaryEmailAddressId)?.emailAddress ??
          u.emailAddresses[0]?.emailAddress ??
          "";
        identityByUserId.set(u.id, { name, email });
      }
    } catch {
      // Leave the map empty — rows fall back to the raw userId.
    }
  }

  const orgIdsToResolve = Array.from(
    new Set([
      ...orgAgg.keys(),
      ...recentWatchListCreates.map((e) => e.orgId).filter((x): x is string => !!x),
      ...recentAskQueries.map((e) => e.orgId).filter((x): x is string => !!x),
    ])
  );
  const orgNameByClerkId = new Map<string, string>();
  if (orgIdsToResolve.length > 0) {
    const orgs = await prisma.organization.findMany({
      where: { clerkOrgId: { in: orgIdsToResolve } },
      select: { clerkOrgId: true, name: true },
    });
    for (const o of orgs) orgNameByClerkId.set(o.clerkOrgId, o.name);
  }

  const operatorNameBySlug = new Map<string, OperatorMeta>();
  if (topOperators.length > 0) {
    const pms = await prisma.pM.findMany({
      where: { slug: { in: topOperators.map(([s]) => s) } },
      select: { slug: true, name: true, market: { select: { city: true, state: true } } },
    });
    for (const p of pms) {
      operatorNameBySlug.set(p.slug, {
        name: p.name,
        sub: `${p.market.city}, ${p.market.state}`,
        href: `/property-managers/${stateCodeToSlug(p.market.state)}/${citySlug(p.market.city)}/${p.slug}`,
      });
    }
  }

  const marketNameById = new Map<string, string>();
  if (topMarkets.length > 0) {
    const markets = await prisma.market.findMany({
      where: { id: { in: topMarkets.map(([id]) => id) } },
      select: { id: true, city: true, state: true },
    });
    for (const m of markets) marketNameById.set(m.id, `${m.city}, ${m.state}`);
  }

  const orgRows: OrgRow[] = [...orgAgg.entries()]
    .map(([clerkOrgId, a]) => ({
      clerkOrgId,
      name: orgNameByClerkId.get(clerkOrgId) ?? null,
      active7: a.active7.size,
      active30: a.active30.size,
      events30: a.events30,
      logins7: a.logins7,
      logins30: a.logins30,
    }))
    .sort((a, b) => b.active30 - a.active30 || b.events30 - a.events30);

  return {
    orgRows,
    recentLogins,
    topOperators,
    topMarkets,
    recentWatchListCreates,
    recentAskQueries,
    wlCreated7: countIn7(watchListCreates),
    wlCreated30: watchListCreates.length,
    ask7: countIn7(askQueries),
    ask30: askQueries.length,
    totalLogins7: loginEvents30.filter((e) => e.occurredAt >= since7).length,
    totalActive30: new Set(events30.filter((e) => e.orgId).map((e) => e.userId)).size,
    identityByUserId,
    userToOrgs,
    orgNameByClerkId,
    operatorNameBySlug,
    marketNameById,
  };
}

export default async function AdminUsagePage() {
  const d = await loadUsageData();

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-16">
      <header className="mb-6 mt-6">
        <h1 className="text-3xl font-bold text-navy">Usage</h1>
        <p className="text-[14px] text-grey-600 mt-2 leading-relaxed max-w-[720px]">
          First-party usage analytics from our own database — no third-party.
          Who signed in and when, per-client active users, the operators and
          markets getting attention, and watch-list / AI activity. Names and
          emails are resolved live from Clerk; the event log itself stores IDs
          only.
        </p>
        <p className="text-[13px] text-grey-500 mt-2">
          Windows are rolling (last 7 / 30 days). Rollups cover up to the most
          recent {WINDOW_EVENT_CAP.toLocaleString()} events in the 30-day
          window.
        </p>
      </header>

      {/* Headline stats */}
      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Logins · 7d" value={d.totalLogins7} />
        <StatCard label="Active users · 30d" value={d.totalActive30} />
        <StatCard label="Watch lists · 30d" value={d.wlCreated30} />
        <StatCard label="AI queries · 30d" value={d.ask30} />
      </section>

      {/* ─────────────── Logins / active users ─────────────── */}
      <section className="mb-12">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3">
          Per-client active users
        </h2>
        {d.orgRows.length === 0 ? (
          <EmptyRow>No org-attributed activity in the last 30 days yet.</EmptyRow>
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-grid">
                <Th>Organization</Th>
                <Th right>Active · 7d</Th>
                <Th right>Active · 30d</Th>
                <Th right>Logins · 7d</Th>
                <Th right>Logins · 30d</Th>
                <Th right>Events · 30d</Th>
              </tr>
            </thead>
            <tbody>
              {d.orgRows.map((o) => (
                <tr key={o.clerkOrgId} className="border-b border-grid">
                  <td className="px-3 py-3 text-navy font-medium">
                    {o.name ?? (
                      <span className="font-mono text-[12px] text-grey-500">
                        {o.clerkOrgId}
                      </span>
                    )}
                  </td>
                  <NumTd>{o.active7}</NumTd>
                  <NumTd>{o.active30}</NumTd>
                  <NumTd muted>{o.logins7}</NumTd>
                  <NumTd muted>{o.logins30}</NumTd>
                  <NumTd muted>{o.events30}</NumTd>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3 mt-8">
          Recent logins
        </h2>
        {d.recentLogins.length === 0 ? (
          <EmptyRow>No logins recorded yet.</EmptyRow>
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-grid">
                <Th>User</Th>
                <Th>Organization</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {d.recentLogins.map((e) => {
                const label = userLabel(d.identityByUserId.get(e.userId));
                const orgs = d.userToOrgs.get(e.userId) ?? [];
                return (
                  <tr key={e.id} className="border-b border-grid">
                    <td className="px-3 py-3">
                      <div className="font-medium text-navy">
                        {label.primary || (
                          <span className="text-grey-500">— (name not set)</span>
                        )}
                      </div>
                      {label.secondary && (
                        <div className="text-[13px] text-grey-600">
                          {label.secondary}
                        </div>
                      )}
                      <div className="font-mono text-[11px] text-grey-500">
                        {e.userId}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-navy">
                      {orgs.length > 0 ? (
                        orgs.map((o) => o.name).join(", ")
                      ) : (
                        <span className="text-grey-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-grey-600 tabular-nums">
                      {fmtDateTime(e.occurredAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ─────────────── Most-viewed ─────────────── */}
      <section className="mb-12">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3">
          Most-viewed operators · last 30 days
        </h2>
        {d.topOperators.length === 0 ? (
          <EmptyRow>No scorecard views in the last 30 days yet.</EmptyRow>
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-grid">
                <Th>Operator</Th>
                <Th right>Scorecard views</Th>
              </tr>
            </thead>
            <tbody>
              {d.topOperators.map(([slug, count]) => {
                const meta = d.operatorNameBySlug.get(slug);
                return (
                  <tr key={slug} className="border-b border-grid">
                    <td className="px-3 py-3">
                      {meta ? (
                        <Link
                          href={meta.href}
                          className="font-medium text-navy hover:underline"
                        >
                          {meta.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-[12px] text-navy">{slug}</span>
                      )}
                      {meta && (
                        <div className="text-[12px] text-grey-500">{meta.sub}</div>
                      )}
                    </td>
                    <NumTd>{count}</NumTd>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3 mt-8">
          Most-viewed markets · last 30 days
        </h2>
        {d.topMarkets.length === 0 ? (
          <EmptyRow>No market views in the last 30 days yet.</EmptyRow>
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-grid">
                <Th>Market</Th>
                <Th right>Market views</Th>
              </tr>
            </thead>
            <tbody>
              {d.topMarkets.map(([id, count]) => (
                <tr key={id} className="border-b border-grid">
                  <td className="px-3 py-3 text-navy font-medium">
                    {d.marketNameById.get(id) ?? (
                      <span className="font-mono text-[12px] text-grey-500">
                        {id}
                      </span>
                    )}
                  </td>
                  <NumTd>{count}</NumTd>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ─────────────── Activity ─────────────── */}
      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3">
          Watch lists created ({d.wlCreated30} in 30d · {d.wlCreated7} in 7d)
        </h2>
        {d.recentWatchListCreates.length === 0 ? (
          <EmptyRow>No watch lists created in the last 30 days yet.</EmptyRow>
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-grid">
                <Th>User</Th>
                <Th>Organization</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {d.recentWatchListCreates.map((e) => (
                <ActivityRow
                  key={e.id}
                  userId={e.userId}
                  orgId={e.orgId}
                  when={e.occurredAt}
                  identityByUserId={d.identityByUserId}
                  orgNameByClerkId={d.orgNameByClerkId}
                />
              ))}
            </tbody>
          </TableWrap>
        )}

        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3 mt-8">
          AI queries ({d.ask30} in 30d · {d.ask7} in 7d)
        </h2>
        {d.recentAskQueries.length === 0 ? (
          <EmptyRow>No AI queries in the last 30 days yet.</EmptyRow>
        ) : (
          <TableWrap>
            <thead>
              <tr className="border-b border-grid">
                <Th>User</Th>
                <Th>Organization</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {d.recentAskQueries.map((e) => (
                <ActivityRow
                  key={e.id}
                  userId={e.userId}
                  orgId={e.orgId}
                  when={e.occurredAt}
                  identityByUserId={d.identityByUserId}
                  orgNameByClerkId={d.orgNameByClerkId}
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>
    </div>
  );
}

// ─── small presentational helpers ─────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-grid bg-surface-soft px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-grey-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`${right ? "text-right" : "text-left"} px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider`}
    >
      {children}
    </th>
  );
}

function NumTd({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      className={`px-3 py-3 text-right tabular-nums ${muted ? "text-grey-600" : "text-navy"}`}
    >
      {children}
    </td>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-grid border-dashed bg-surface-soft px-4 py-6 text-center text-[14px] text-grey-600">
      {children}
    </p>
  );
}

function ActivityRow({
  userId,
  orgId,
  when,
  identityByUserId,
  orgNameByClerkId,
}: {
  userId: string;
  orgId: string | null;
  when: Date;
  identityByUserId: Map<string, Identity>;
  orgNameByClerkId: Map<string, string>;
}) {
  const label = userLabel(identityByUserId.get(userId));
  return (
    <tr className="border-b border-grid">
      <td className="px-3 py-3">
        <div className="font-medium text-navy">
          {label.primary || <span className="text-grey-500">— (name not set)</span>}
        </div>
        {label.secondary && (
          <div className="text-[13px] text-grey-600">{label.secondary}</div>
        )}
        <div className="font-mono text-[11px] text-grey-500">{userId}</div>
      </td>
      <td className="px-3 py-3 text-navy">
        {orgId ? (
          orgNameByClerkId.get(orgId) ?? (
            <span className="font-mono text-[12px] text-grey-500">{orgId}</span>
          )
        ) : (
          <span className="text-grey-500">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-grey-600 tabular-nums">{fmtDateTime(when)}</td>
    </tr>
  );
}
