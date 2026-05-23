// v0.18 (PR #71, Phase 3) — Dedicated route for Clerk's
// <OrganizationProfile />. Lets users bookmark or link directly to
// org management (invitations, member list, role changes, org
// rename). The same surface is also reachable as a modal via the
// "Manage organization" link inside <OrganizationSwitcher>'s
// dropdown — having both routes-and-modal access is intentional
// for v1 ergonomics.
//
// Auth + soft-fallback parallel the other authed surfaces:
//   - No userId      → notFound() (middleware should have caught it
//                       upstream; defensive belt-and-suspenders).
//   - No active org  → redirect to /setup-workspace with a return-to
//                       so the post-provisioning land works.
//   - Otherwise      → render OrganizationProfile inside the
//                       standard SiteHeader layout.
//
// Role-gating: Clerk's <OrganizationProfile /> handles this
// internally. Members see a read-only members list and cannot
// invite or change roles; admins see the full surface. No code-
// level gating required on our side. Verified by inspection — if
// Clerk's component starts requiring explicit role config to
// behave this way, configure here.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { OrganizationProfile } from "@clerk/nextjs";
import { getActiveOrgId } from "@/lib/auth/active-org";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organization",
  robots: { index: false, follow: false },
};

export default async function OrganizationPage() {
  const { userId } = await auth();
  if (!userId) notFound();
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    redirect("/setup-workspace?from=/organization");
  }

  return (
    <main className="bg-white">
      {/* Wider container than /setup-workspace because
          OrganizationProfile is a substantive surface (tabs for
          Members, Invitations, General settings). Tracks the
          ~max-w-[920px] feel of the existing watch-list workspace. */}
      <div className="mx-auto max-w-[920px] px-6 py-12">
        <OrganizationProfile
          // Keep Clerk's defaults for layout; lightly theme to match
          // the navy + teal palette used elsewhere. Heavy
          // customization isn't worth the maintenance cost —
          // visual consistency comes from matching the existing
          // UserButton + OrganizationSwitcher tone, not pixel
          // re-skinning of Clerk's components.
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "shadow-none border border-grid",
              headerTitle: "text-navy",
              navbar: "bg-surface-soft",
              formButtonPrimary:
                "bg-navy hover:bg-navy-700 text-white text-[13px] font-semibold",
            },
          }}
        />
      </div>
    </main>
  );
}
