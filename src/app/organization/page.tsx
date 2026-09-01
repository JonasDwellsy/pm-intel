// Product-aware organization management for the shared Dwellsy IQ identity.
// Clerk remains authoritative for membership, while this route makes the
// Dwellsy IQ Markets assignment an explicit, independent control.
//
// Auth + soft-fallback parallel the other authed surfaces:
//   - No userId      → notFound() (middleware should have caught it
//                       upstream; defensive belt-and-suspenders).
//   - No active org  → redirect to /setup-workspace with a return-to
//                       so the post-provisioning land works.
//   - Otherwise      → render OrganizationProfile inside the
//                       standard SiteHeader layout.
//
// Every mutation re-checks the authenticated Clerk organization administrator.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getActiveOrgId } from "@/lib/auth/active-org";
import { loadOperatorIqProductMembers } from "@/lib/auth/operator-product-access.server";
import { inviteOperatorIqOrganizationMemberAction, updateOperatorIqMemberProductAccessAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organization",
  robots: { index: false, follow: false },
};

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ invited?: string }> }) {
  const session = await auth();
  const { userId } = session;
  if (!userId) notFound();
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    redirect("/setup-workspace?from=/organization");
  }

  const [members, query] = await Promise.all([
    session.orgId ? loadOperatorIqProductMembers(session.orgId) : Promise.resolve([]),
    searchParams,
  ]);

  return <main className="bg-white"><div className="mx-auto max-w-[920px] px-6 py-12"><header><p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-teal">Shared Dwellsy IQ organization</p><h1 className="mt-2 text-3xl font-bold text-navy">Dwellsy IQ Markets access</h1><p className="mt-3 max-w-[700px] text-[15px] leading-7 text-grey-600">Organization membership and product access are separate. People listed here remain part of Dwellsy IQ even when Dwellsy IQ Markets is removed.</p></header>{query.invited === "1" && <p role="status" className="mt-6 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-[13px] font-semibold text-teal-900">Invitation sent with Dwellsy IQ Markets access only.</p>}{session.orgRole === "org:admin" && <section className="mt-8 rounded-md border border-grid bg-surface-soft p-5"><h2 className="text-lg font-semibold text-navy">Invite a Dwellsy IQ Markets member</h2><p className="mt-1 text-[13px] text-grey-600">This invitation joins the shared organization and assigns Dwellsy IQ Markets only.</p><form action={inviteOperatorIqOrganizationMemberAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]"><input required type="email" name="email" placeholder="name@company.com" className="rounded-md border border-grid bg-white px-3 py-2 text-[14px]" /><select name="role" defaultValue="org:member" className="rounded-md border border-grid bg-white px-3 py-2 text-[14px]"><option value="org:member">Member</option><option value="org:admin">Administrator</option></select><button className="rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white">Send invitation</button></form></section>}<section className="mt-8"><h2 className="text-lg font-semibold text-navy">Members</h2><div className="mt-3 divide-y divide-grid rounded-md border border-grid">{members.map((member) => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"><div><p className="font-medium text-navy">{member.name}</p><p className="mt-1 text-[12px] text-grey-500">{member.email} · {member.role === "org:admin" ? "Organization administrator" : "Organization member"}</p></div>{session.orgRole === "org:admin" && <form action={updateOperatorIqMemberProductAccessAction}><input type="hidden" name="userId" value={member.userId} /><input type="hidden" name="enabled" value={member.enabled ? "false" : "true"} /><button disabled={member.userId === session.userId && member.enabled} className={`rounded-md px-4 py-2 text-[12px] font-semibold ${member.enabled ? "border border-red-200 text-red-700 disabled:cursor-not-allowed disabled:opacity-40" : "bg-navy text-white"}`}>{member.enabled ? member.userId === session.userId ? "Your access" : "Remove Dwellsy IQ Markets" : "Grant Dwellsy IQ Markets"}</button></form>}</div>)}</div></section></div></main>;
}
