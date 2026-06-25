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
import { prisma } from "@/lib/prisma";
import { InviteUserForm } from "@/components/admin/InviteUserForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // robots noindex inherited from src/app/admin/layout.tsx
  title: "Admin · Organization detail",
};

interface MemberRow {
  id: string;
  userId: string;
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
    },
  });

  if (!org || org.personalForUserId !== null) {
    // Personal orgs aren't manageable from this admin surface.
    notFound();
  }

  const members: MemberRow[] = org.memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
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
                    Clerk user ID
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
                    <td className="px-3 py-3 font-mono text-[12px] text-navy">
                      {m.userId}
                    </td>
                    <td className="px-3 py-3 text-navy">
                      {roleLabel(m.role)}
                    </td>
                    <td className="px-3 py-3 text-grey-600">
                      {formatDate(m.createdAt)}
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
