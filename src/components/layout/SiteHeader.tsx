import Image from "next/image";
import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { SearchInput } from "@/components/search/SearchInput";
import { NAV_ITEMS, PRIMARY_CTA } from "@/lib/nav";

// v0.18 PR #72 hotfix — Resolve signed-in state via try/catch'd
// `auth()` rather than Clerk's `<Show when="…">` server component.
//
// Why: SiteHeader sits in the root layout, so it renders on EVERY
// route, including Next.js's internal `/_not-found` pseudo-route.
// Some inbound requests skip the middleware matcher (which excludes
// paths ending in `.png`, `.js`, `.css`, etc. for static-asset
// performance) — when a bot probes for `/wp-login.js` or similar,
// the matcher excludes the path, middleware never runs, but Next.js
// still routes to `/_not-found` for rendering. The layout then
// renders SiteHeader, `<Show>` internally calls `auth()`, and Clerk
// throws "auth() was called but Clerk can't detect usage of
// clerkMiddleware" because the middleware context is missing.
//
// Replacing `<Show>` with a try-caught `auth()` call resolves it
// cleanly: when middleware didn't run, we treat the request as
// signed-out and render the public variant of the header. Bot
// probes get a normal-looking 404 instead of an unhandled Clerk
// error in Sentry.
//
// The header is unchanged for real users on real paths — auth()
// succeeds, isSignedIn reflects the actual session, the signed-in
// cluster (OrganizationSwitcher + UserButton) renders as before.

/** Best-effort signed-in resolver. Returns false (signed-out)
 *  whenever Clerk's middleware context is missing — which happens
 *  on bot-probed not-found requests for static-extension URLs.
 *  Other Clerk errors are unexpected and captured to Sentry; we
 *  still default to signed-out so the page renders. */
async function resolveSignedIn(): Promise<boolean> {
  try {
    const session = await auth();
    return Boolean(session.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The "no middleware" path is the documented Clerk failure mode
    // we're handling here — don't pollute Sentry with one capture
    // per bot probe. Match by the substring Clerk uses in its
    // thrown Error message.
    if (!message.includes("clerkMiddleware")) {
      Sentry.captureException(err, {
        tags: { component: "SiteHeader", area: "auth_fallback" },
      });
    }
    return false;
  }
}

export async function SiteHeader() {
  const isSignedIn = await resolveSignedIn();
  return (
    <header className="sticky top-0 z-50 border-b border-grid bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-6 sm:px-10">
        <Link
          href="/"
          aria-label="Dwellsy IQ — PM Intel"
          className="flex items-center gap-4 text-navy"
        >
          {/* Real Dwellsy IQ brand logo. Native asset is 1000×313 (3.2:1
              aspect); displayed at 48px height (h-12) so the "IQ"
              character height visually matches the 36px primary CTA
              button. Width 153 keeps the 3.2:1 aspect ratio so the
              <Image> layout calculation doesn't trigger a reflow.
              Bumped from h-8 (32px) in the UI polish pass — the
              prior size was too compressed against the surrounding
              nav typography. Header retains its h-[76px] frame
              (48 + 14px top/bottom padding leaves comfortable air). */}
          <Image
            src="/dwellsy-iq-logo.png"
            alt="Dwellsy IQ"
            width={153}
            height={48}
            priority
            className="h-12 w-auto"
          />
          <span aria-hidden className="h-5 w-px bg-grid" />
          <span className="text-sm font-semibold text-navy">PM Intel</span>
        </Link>
        <nav className="flex items-center gap-5">
          {/* Nav items render in the order declared by NAV_ITEMS
              (src/lib/nav.ts) — single source of truth shared with
              the footer. Watch Lists leads the order to surface the
              acquirer workflow without an extra click. Below the
              `sm` breakpoint the text links are hidden via the
              sm:inline-block prefix; the primary CTA on the right
              stays visible on every viewport. */}
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                "hidden text-sm font-medium text-navy transition-colors hover:text-teal " +
                (item.badge ? "items-center gap-1.5 sm:inline-flex" : "sm:inline-block")
              }
            >
              {item.label}
              {item.badge && (
                <span
                  aria-hidden
                  className="inline-flex h-4 items-center rounded-sm bg-teal px-1 text-[9px] font-bold uppercase tracking-[0.06em] text-white"
                >
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
          {/* v0.7 search — top-nav PM autocomplete. Hidden on the
              narrowest viewports where the input doesn't fit; Cmd+K
              still works to invoke the modal from anywhere. */}
          <div className="hidden md:block">
            <SearchInput />
          </div>
          {/* Auth control. Signed-in → Clerk's UserButton avatar
              + OrganizationSwitcher. Signed-out → plain "Sign in"
              text link to the Clerk-managed page. The primary CTA
              below stays visible in both states so the discovery
              path keeps working for anonymous visitors. */}
          {!isSignedIn && (
            <Link
              href="/sign-in"
              className="hidden text-sm font-medium text-navy transition-colors hover:text-teal sm:inline-block"
            >
              Sign in
            </Link>
          )}
          {isSignedIn && (
            <>
              {/* v0.18 (PR #70, Phase 2 multi-tenancy) — Organization
                  switcher. Sits immediately left of UserButton so the
                  "auth cluster" stays visually grouped on the right.
                  Hidden below sm to keep the mobile header tight; multi-
                  org users can switch on desktop and the choice
                  persists in the Clerk session JWT.
                    hidePersonal: false  → Personal workspace shows in
                                           the dropdown alongside any
                                           joined team orgs.
                    afterSelect/Create/Leave → land on /watch-lists so
                                               the user sees the
                                               org-filtered list
                                               immediately. */}
              <div className="hidden sm:flex max-w-[200px] [&_.cl-organizationSwitcherTrigger]:!h-[34px] [&_.cl-organizationPreviewMainIdentifier]:!truncate">
                <OrganizationSwitcher
                  hidePersonal={false}
                  afterCreateOrganizationUrl="/watch-lists"
                  afterSelectOrganizationUrl="/watch-lists"
                  afterLeaveOrganizationUrl="/watch-lists"
                  appearance={{
                    elements: {
                      // Match the UserButton's compact, 30px-ish visual
                      // weight so the auth cluster reads as one unit.
                      organizationSwitcherTrigger:
                        "py-1 px-2 rounded-md hover:bg-surface-soft",
                      organizationPreviewAvatarBox: "h-[26px] w-[26px]",
                      organizationPreviewMainIdentifier:
                        "text-[13px] font-medium text-navy",
                    },
                  }}
                />
              </div>
              <UserButton
                appearance={{
                  elements: {
                    // Bump the avatar from Clerk's default 32px to 30px
                    // so it visually sits at the same height as the
                    // primary CTA button (36px) without dominating it.
                    avatarBox: "h-[30px] w-[30px]",
                  },
                }}
              />
            </>
          )}
          {/* Primary CTA — points at the template picker so anyone
              (anonymous or signed in) can clone a starter watch list
              without an auth gate. Save still requires auth. */}
          <Link
            href={PRIMARY_CTA.href}
            className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-700"
          >
            {PRIMARY_CTA.label}
          </Link>
        </nav>
      </div>
    </header>
  );
}
