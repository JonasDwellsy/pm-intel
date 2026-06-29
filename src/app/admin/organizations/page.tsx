// v0.21 — Admin → Organizations.
//
// First-paying-customer launch readiness. Lists all enterprise / team
// orgs (personalForUserId IS NULL — personal orgs are auto-provisioned
// for individual signups and hidden from this surface). Below the
// list, the create form lets the admin spin up a new customer org;
// it calls a server action that hits Clerk's backend API, and the
// org.created webhook mirrors the new row into our DB.
//
// What's NOT here yet (deferred to the per-org detail page):
//   - member list
//   - invite-user form
//   - disable / archive org
//
// Auth: gated by src/app/admin/layout.tsx (auth + isAdminUser).

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CreateOrganizationForm } from "@/components/admin/CreateOrganizationForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // robots noindex inherited from src/app/admin/layout.tsx
  title: "Admin · Organizations",
};

interface OrgRow {
  id: string;
  clerkOrgId: string;
  name: string;
  memberCount: number;
  watchListCount: number;
  marketAccess: string;
  createdAt: Date;
}

async function loadOrganizations(): Promise<OrgRow[]> {
  // Team orgs only. Personal orgs (personalForUserId IS NOT NULL) are
  // a per-user implementation detail of the v0.18 multi-tenant model;
  // showing them here would clutter the surface with one row per
  // signed-in user.
  const orgs = await prisma.organization.findMany({
    where: { personalForUserId: null },
    include: {
      _count: {
        select: { memberships: true, watchLists: true, marketAccess: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return orgs.map((o) => ({
    id: o.id,
    clerkOrgId: o.clerkOrgId,
    name: o.name,
    memberCount: o._count.memberships,
    watchListCount: o._count.watchLists,
    // v0.22 — at-a-glance market entitlement. "All" (flag), "N markets"
    // (explicit grants), or "None" (fail-closed, not yet provisioned).
    marketAccess: o.allMarkets
      ? "All markets"
      : o._count.marketAccess > 0
        ? `${o._count.marketAccess} markets`
        : "None",
    createdAt: o.createdAt,
  }));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminOrganizationsPage() {
  const orgs = await loadOrganizations();

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-12">
      <header className="mb-6 mt-6">
        <h1 className="text-3xl font-bold text-navy">Organizations</h1>
        <p className="text-[14px] text-grey-600 mt-2 leading-relaxed max-w-[680px]">
          Enterprise / customer accounts. Each org maps 1:1 to a Clerk
          organization and owns its users&apos; watch lists. To onboard
          a new customer: create the org below, then open the org row
          and invite the customer&apos;s primary contact — they&apos;ll
          get an email with a sign-in link scoped to that org.
        </p>
        <p className="text-[13px] text-grey-500 mt-2">
          Personal workspaces (auto-provisioned per individual signup)
          aren&apos;t shown here.
        </p>
      </header>

      <section className="mb-8">
        <CreateOrganizationForm />
      </section>

      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-grey-600 mb-3">
          {orgs.length} {orgs.length === 1 ? "organization" : "organizations"}
        </h2>

        {orgs.length === 0 ? (
          <p className="rounded-md border border-grid border-dashed bg-surface-soft px-4 py-8 text-center text-[14px] text-grey-600">
            No customer organizations yet. Create one with the form above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-grid">
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Members
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Watch lists
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Market access
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-grey-600 text-[12px] uppercase tracking-wider">
                    Clerk ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-grid">
                    <td className="px-3 py-3 text-navy font-medium">
                      <Link
                        href={`/admin/organizations/${o.id}`}
                        className="hover:underline"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-navy">
                      {o.memberCount}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-grey-600">
                      {o.watchListCount}
                    </td>
                    <td className="px-3 py-3 text-navy">{o.marketAccess}</td>
                    <td className="px-3 py-3 text-grey-600">
                      {formatDate(o.createdAt)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] text-grey-500">
                      {o.clerkOrgId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
