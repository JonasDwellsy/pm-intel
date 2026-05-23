import Image from "next/image";
import Link from "next/link";
import { OrganizationSwitcher, Show, UserButton } from "@clerk/nextjs";
import { SearchInput } from "@/components/search/SearchInput";
import { NAV_ITEMS, PRIMARY_CTA } from "@/lib/nav";

export function SiteHeader() {
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
              (opens a popover with Manage account + Sign out).
              Signed-out → plain "Sign in" text link to the
              Clerk-managed page. Clerk v7 collapsed the old
              <SignedIn>/<SignedOut> components into a single <Show>
              with a `when` prop — same SSR behaviour, different
              ergonomics. The primary CTA below stays visible in both
              states so the discovery path keeps working for
              anonymous visitors. */}
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="hidden text-sm font-medium text-navy transition-colors hover:text-teal sm:inline-block"
            >
              Sign in
            </Link>
          </Show>
          <Show when="signed-in">
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
          </Show>
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
