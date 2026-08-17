// Workspace access holding page.
//
// Routed to when getActiveOrgId() returns null for a signed-in user
// — they are not a member of any organization we can resolve. Under
// the invite-only model this is an edge/transient state: every real
// user is invited into a client org and added to it on acceptance.
//
// Personal-org auto-provisioning was removed (see
// src/app/api/clerk/webhook/route.ts and provision-personal-org.ts),
// so this page no longer creates anything. It:
//
//   1. Fast path: if an org resolves now (e.g. the membership webhook
//      landed between the original redirect and this render), bounce
//      to ?from= / /watch-lists.
//   2. Otherwise: render a "you're not in an organization yet — an
//      administrator needs to add you" holding page with a manual
//      refresh + a contact link.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { activateMarketIqDevelopmentWorkspace } from "@/app/setup-workspace/actions";
import { getActiveOrgId } from "@/lib/auth/active-org";
import { marketIqDevelopmentPreviewEnabled } from "@/lib/market-iq/feature";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace access",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ from?: string; activation?: string }>;
}

/** Whitelist of redirect targets so an attacker can't craft a
 *  ?from=https://evil.com link that gets blindly followed.
 *  Internal paths only. */
function sanitizeReturnTo(from: string | undefined): string {
  if (!from) return "/watch-lists";
  if (!from.startsWith("/")) return "/watch-lists";
  if (from.startsWith("//")) return "/watch-lists"; // protocol-relative
  return from;
}

export default async function SetupWorkspacePage({ searchParams }: PageProps) {
  const { from, activation } = await searchParams;
  const developmentPreview = marketIqDevelopmentPreviewEnabled();
  const returnTo = sanitizeReturnTo(
    from ?? (developmentPreview ? "/market-iq/launch" : undefined)
  );

  const { userId } = await auth();
  if (!userId) {
    // Unauthenticated visitor — push them through Clerk's sign-in
    // first, with this page as the post-auth destination.
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/setup-workspace?from=${encodeURIComponent(returnTo)}`)}`);
  }

  // Fast path: an org resolves now. This covers the brief race where
  // an invited user's user.created fires before their
  // organizationMembership.created lands — by the time they reach
  // here (or refresh), the membership row exists and we bounce them
  // straight to where they were headed.
  const existingOrgId = await getActiveOrgId();
  if (existingOrgId) {
    redirect(returnTo);
  }

  if (developmentPreview) {
    return (
      <main className="bg-white">
        <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
          <p className="dq-eyebrow text-teal">Market IQ preview</p>
          <h1 className="mt-3 text-[24px] font-semibold text-navy">
            Activate your preview workspace
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-foreground/75">
            Your temporary development sign-in is verified. Connect it to the
            isolated Cleveland pilot workspace to review editions, recipients,
            and distribution controls.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            This affects only the Market IQ Preview database. It does not alter
            Operator IQ production and it never sends an email.
          </p>
          {activation === "unavailable" && (
            <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Preview activation is unavailable because the isolated database
              does not contain exactly one eligible Cleveland pilot workspace.
            </p>
          )}
          <form action={activateMarketIqDevelopmentWorkspace} className="mt-7">
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="inline-flex h-11 items-center rounded-md bg-navy px-6 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700">
              Enter Market IQ
            </button>
          </form>
        </div>
      </main>
    );
  }

  // No resolvable org, and we no longer auto-create one — an
  // administrator must add this user to an organization.
  return (
    <main className="bg-white">
      <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
        <p className="dq-eyebrow text-teal">Workspace access</p>
        <h1 className="mt-3 text-[24px] font-semibold text-navy">
          You&rsquo;re not part of an organization yet
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-foreground/75">
          Operator IQ is provisioned per organization. An administrator
          needs to add you to your team&rsquo;s workspace before you can
          view markets and build watch lists.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          Just accepted an invitation? Give it a moment and refresh —
          your access appears as soon as the invite is processed.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            href="/setup-workspace"
            className="inline-flex h-11 items-center rounded-md bg-navy px-6 text-[14px] font-semibold text-white transition-colors hover:bg-navy-700"
          >
            Refresh
          </Link>
          <a
            href="mailto:sales@dwellsy.com?subject=Dwellsy%20IQ%20%E2%80%94%20workspace%20access"
            className="inline-flex h-11 items-center rounded-md border border-navy bg-white px-6 text-[14px] font-semibold text-navy transition-colors hover:bg-navy-soft"
          >
            Contact us
          </a>
        </div>
      </div>
    </main>
  );
}
