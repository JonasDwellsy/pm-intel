// v0.21 — Admin → Organizations → [id] detail.
//
// Shows the org name, current member list, and an Invite User form.
// Auth: gated by src/app/admin/layout.tsx.
//
// What's NOT here yet:
//   - remove member (post-MVP — adds destructive action surface)
//   - rename org (post-MVP — Clerk surfaces this internally too)
//   - org-scoped activity log (post-MVP)
//
// The route param is the LOCAL Organization id (cuid), not the
// Clerk org id — internal links use the DB id so they remain stable
// even if a Clerk org is ever re-created.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { InviteUserForm } from "@/components/admin/InviteUserForm";
import { DeleteOrgButton } from "@/components/admin/DeleteOrgButton";
import {
  MarketAccessForm,
  type MarketAccessGroup,
} from "@/components/admin/MarketAccessForm";
import { STATE_CODE_TO_NAME } from "@/lib/slugify";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // robots noindex inherited from src/app/admin/layout.tsx
  title: "Admin · Organization detail",
};

interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function roleLabel(role: string): string {
  // Clerk uses "org:admin" / "org:member" — strip the prefix for
  // display so the table reads cleanly.
  if (role === "org:admin") return "Admin";
  if (role === "org:member") return "Member";
  return role;
}

/** "north-carolina" → "North Carolina" for the checklist state headers. */
function stateDisplay(stateCode: string): string {
  const slug = STATE_CODE_TO_NAME[stateCode] ?? stateCode.toLowerCase();
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Group every market into the checklist shape: states alphabetical,
 *  cities alphabetical within each state. */
function buildMarketGroups(
  markets: Array<{ id: string; city: string; state: string }>
): MarketAccessGroup[] {
  const byState = new Map<string, Array<{ id: string; label: string }>>();
  for (const m of markets) {
    const arr = byState.get(m.state) ?? [];
    arr.push({ id: m.id, label: m.city });
    byState.set(m.state, arr);
  }
  return [...byState.entries()]
    .map(([state, ms]) => ({
      stateLabel: stateDisplay(state),
      markets: ms.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.stateLabel.localeCompare(b.stateLabel));
}

export default async function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
      },
      marketAccess: { select: { marketId: true } },
      _count: { select: { watchLists: true } },
    },
  });

  if (!org || org.personalForUserId !== null) {
    // Personal orgs aren't manageable from this admin surface.
    notFound();
  }

  const allMarketRows = await prisma.market.findMany({
    select: { id: true, city: true, state: true },
  });
  const marketGroups = buildMarketGroups(allMarketRows);
  const grantedIds = org.marketAccess.map((m) => m.marketId);

  // Resolve each membership's Clerk user → name + email. Memberships store only
  // the Clerk user ID; the person's identity lives in Clerk. Batch-fetch in one
  // call. If the lookup fails (Clerk API error) or a user can't be resolved
  // (e.g. deleted account), we fall back to showing just the ID.
  const memberUserIds = org.memberships.map((m) => m.userId);
  const identityByUserId = new Map<string, { name: string; email: string }>();
  if (memberUserIds.length > 0) {
    try {
      const client = await clerkClient();
      const { data } = await client.users.getUserList({
        userId: memberUserIds,
        limit: memberUserIds.length,
      });
      for (const u of data) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
        const email =
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u.emailAddresses[0]?.emailAddress ??
          "";
        identityByUserId.set(u.id, { name, email });
      }
    } catch {
      // Leave the map empty — rows render with the user ID only.
    }
  }

  const members: MemberRow[] = org.memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: identityByUserId.get(m.userId)?.name ?? "",
    email: identityByUserId.get(m.userId)?.email ?? "",
    role: m.role,
    createdAt: m.createdAt,
  }));

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-12">
      <header className="mb-6 mt-6">
        <p className="text-[12px] text-grey-500 mb-1">
          <Link
            href="/admin/organizations"
            className="hover:text-navy hover:underline"
          >
            ← Organizations
          </Link>
        </p>
        <h1 className="text-3xl font-bold text-navy">{org.name}</h1>
        <p className="text-[12px] font-mono text-grey-500 mt-2">
          {org.clerkOrgId}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-1">
          Market access
        </h2>
        <p className="text-[13px] text-grey-500 mb-3 max-w-[680px]">
          Provision the markets this organization can see. Members get full
          scorecards, search, and AI answers for these markets only;
          everything else shows as &ldquo;available to add.&rdquo; New orgs
          start with no access until provisioned here.
        </p>
        <MarketAccessForm
          orgId={org.id}
          initialAllMarkets={org.allMarkets}
          initialSelectedIds={grantedIds}
          groups={marketGroups}
          totalMarkets={allMarketRows.length}
        />
      </section>

      <section className="mb-8">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3">
          Invite a user
        </h2>
        <InviteUserForm clerkOrgId={org.clerkOrgId} />
        <p className="text-[12px] text-grey-500 mt-2">
          They&apos;ll get an email with a sign-in link scoped to this
          organization. New members appear in the table below once they
          accept the invitation and sign in.
        </p>
      </section>

      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3">
          {members.length} {members.length === 1 ? "member" : "members"}
        </h2>

        {members.length === 0 ? (
          <p className="rounded-md border border-grid border-dashed bg-surface-soft px-4 py-8 text-center text-[14px] text-grey-600">
            No members yet. Invite the customer&apos;s primary contact
            using the form above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-grid">
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Member
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-grid">
                    <td className="px-3 py-3">
                      <div className="font-medium text-navy">
                        {m.name || <span className="text-grey-500">— (name not set)</span>}
                      </div>
                      {m.email && (
                        <div className="text-[13px] text-grey-600">{m.email}</div>
                      )}
                      <div className="font-mono text-[11px] text-grey-500">{m.userId}</div>
                    </td>
                    <td className="px-3 py-3 align-top text-navy">
                      {roleLabel(m.role)}
                    </td>
                    <td className="px-3 py-3 align-top text-grey-600">
                      {formatDate(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 rounded-md border border-red-200 bg-red-50/40 p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-red-700 mb-1">
          Danger zone
        </h2>
        <p className="text-[13px] text-grey-600 mb-4 max-w-[680px]">
          Permanently delete this organization and everything the app stores
          for it — its members, market grants, and watch lists. Use this to
          remove leftover accounts from the dev&rarr;prod migration or to
          offboard a customer. This can&apos;t be undone.
        </p>
        <DeleteOrgButton
          orgId={org.id}
          orgName={org.name}
          memberCount={members.length}
          watchListCount={org._count.watchLists}
        />
      </section>
    </div>
  );
}
