// v0.18 (PR #65) — Soft-fallback workspace setup.
//
// Routed to when getActiveOrgId() returns null — typically right
// after signup if the user.created webhook's personal-org
// provisioning hit a transient failure. This page:
//
//   1. Server-side: re-runs the provisioning. If it succeeds (or
//      detects the org already exists), redirects to ?from= or
//      /watch-lists.
//   2. Otherwise: renders a friendly "we're setting up your
//      workspace" UI with auto-refresh + a manual retry button.
//
// Why retry on every page visit instead of background polling?
// Simpler. The user is already on the page; running the retry
// server-side once per render is cheap and the page is hidden
// from anyone whose org is already provisioned. If the retry
// succeeds, the immediate redirect means the user never sees
// this page at all.
//
// Sentry: every failed retry from this page captures with
// userId tag — so we can correlate user complaints to
// provisioning failures.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { getActiveOrgId } from "@/lib/auth/active-org";
import { provisionPersonalOrgForUser } from "@/lib/auth/provision-personal-org";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Setting up your workspace",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ from?: string }>;
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
  const { from } = await searchParams;
  const returnTo = sanitizeReturnTo(from);

  const { userId } = await auth();
  if (!userId) {
    // Unauthenticated visitor — push them through Clerk's sign-in
    // first, with this page as the post-auth destination.
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/setup-workspace?from=${encodeURIComponent(returnTo)}`)}`);
  }

  // Fast path: did provisioning already complete (e.g., webhook
  // arrived between the original 404 and this re-fetch)?
  const existingOrgId = await getActiveOrgId();
  if (existingOrgId) {
    redirect(returnTo);
  }

  // Retry path: attempt to provision. The function is idempotent —
  // safe to call on every render.
  const result = await provisionPersonalOrgForUser(userId);

  if (result.status === "created" || result.status === "already_exists") {
    // Clerk side is good. The organization.created +
    // organizationMembership.created webhooks should land within ~1s
    // and write our DB rows. Refresh-redirect via meta — when the
    // page reloads, getActiveOrgId() will find the row and bounce
    // to returnTo.
    return (
      <main className="bg-white">
        <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
          {/* Auto-refresh after 1500ms — gives the webhook handler
              time to write our DB row. */}
          <meta httpEquiv="refresh" content="2" />
          <h1 className="text-[24px] font-semibold text-navy">
            Setting up your workspace…
          </h1>
          <p className="mt-3 text-[14.5px] text-foreground/75">
            One moment. We&rsquo;re creating your personal workspace and
            will redirect you to the watch list page automatically.
          </p>
          <p className="mt-6 text-[12.5px] text-muted-foreground">
            If this page doesn&rsquo;t refresh in a few seconds,{" "}
            <a href="/setup-workspace" className="text-teal hover:text-teal-700 hover:underline">
              click here to retry
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  // Hard failure — Clerk's org-create API rejected. Most likely
  // cause: the Clerk plan doesn't include Organizations (Hobby
  // plan in production). Log to Sentry with the error so we can
  // diagnose, and surface a manual-retry UI.
  Sentry.captureException(
    new Error(`Personal org provisioning failed: ${result.error}`),
    {
      tags: {
        provisioning: "personal_org",
        provisioning_path: "setup_workspace_page",
      },
      extra: { userId, error: result.error },
    }
  );

  return (
    <main className="bg-white">
      <div className="mx-auto max-w-[520px] px-6 py-24 text-center">
        <h1 className="text-[24px] font-semibold text-navy">
          Workspace setup needs another try
        </h1>
        <p className="mt-3 text-[14.5px] text-foreground/75">
          We weren&rsquo;t able to provision your personal workspace just
          now. This is usually a transient hiccup — try again in a
          moment.
        </p>
        <a
          href="/setup-workspace"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-teal px-4 text-[13.5px] font-semibold text-white hover:bg-teal-700"
        >
          Try again
        </a>
        <p className="mt-6 text-[11.5px] text-muted-foreground">
          If this keeps happening, contact support — we have logs and
          can resolve it on our end.
        </p>
      </div>
    </main>
  );
}
