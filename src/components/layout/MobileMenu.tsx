"use client";

// PR #83 — Mobile hamburger menu.
//
// Below `lg` (1024px) the desktop nav cluster (5 nav links +
// search + auth + CTA) collapses to brand + CTA only. PR #81
// established that breakpoint to fix the cramped-intermediate
// failure mode; this PR fills the gap by giving narrow-viewport
// visitors an actual way to reach Watch Lists / Markets / Briefs
// / Methodology / Ask without scrolling to the footer.
//
// Design choices:
//   - Top-down drawer (drops from below the header) rather than
//     side drawer. Reads as an extension of the header, not a
//     separate overlay surface, and matches the visual gravity
//     of a button rendered at the top-right.
//   - Hamburger sits immediately left of the primary CTA so the
//     "secondary" nav affordance pairs with the "primary" action
//     button visually. Both stay visible on mobile.
//   - Backdrop is the page area BELOW the header so the visitor
//     can still see the brand + close affordance while the menu
//     is open. Tapping the backdrop closes the menu.
//   - Auth controls (Clerk's OrganizationSwitcher + UserButton)
//     ride inside the menu when signed in so multi-tenant
//     visitors can still swap orgs from a phone.
//
// Accessibility:
//   - Hamburger button is a real <button> with aria-expanded +
//     aria-controls + dynamic aria-label
//   - Escape key closes the menu
//   - Body scroll locked while the menu is open
//   - Each nav link closes the menu on click so the next view
//     doesn't render with a stale-open menu state

import { useEffect, useState } from "react";
import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { NAV_ITEMS } from "@/lib/nav";

export function MobileMenu({ isSignedIn }: { isSignedIn: boolean }) {
  const [open, setOpen] = useState(false);

  // Escape-to-close + body-scroll lock while the menu is open.
  // Both effects only attach listeners when `open` is true to
  // avoid running an interval of event-handler bookkeeping during
  // the (much more common) closed state.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-navy transition-colors hover:bg-surface-soft lg:hidden"
      >
        {open ? <CloseIcon /> : <HamburgerIcon />}
      </button>

      {open && (
        <>
          {/* Backdrop covers everything BELOW the header (top: 76px
              matches the header's h-[76px] frame). z-30 sits under
              the menu panel's z-40 but over normal page content. */}
          <div
            onClick={() => setOpen(false)}
            aria-hidden
            className="fixed inset-0 top-[76px] z-30 bg-navy/30 backdrop-blur-sm lg:hidden"
          />

          {/* Menu panel — drops down from below the header, full
              width. Border-bottom continues the header's visual
              line so the drawer reads as an extension. */}
          <nav
            id="mobile-nav"
            aria-label="Primary navigation"
            className="fixed inset-x-0 top-[76px] z-40 border-b border-grid bg-white shadow-lg lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4 sm:px-10">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-3 text-[15px] font-medium text-navy transition-colors hover:bg-surface-soft"
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

              {/* Divider between nav and auth */}
              <div className="my-2 border-t border-grid" aria-hidden />

              {/* Auth section. Signed-out → Sign in link.
                  Signed-in → Clerk's OrganizationSwitcher +
                  UserButton, both indented to match the nav-item
                  visual rhythm. Clerk's components are themselves
                  popovers/dropdowns so they coexist with our
                  drawer's open state without conflict. */}
              {!isSignedIn ? (
                <Link
                  href="/sign-in"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-3 text-[15px] font-medium text-navy transition-colors hover:bg-surface-soft"
                >
                  Sign in
                </Link>
              ) : (
                <div className="flex flex-col gap-3 px-3 py-2">
                  <OrganizationSwitcher
                    hidePersonal={false}
                    afterCreateOrganizationUrl="/watch-lists"
                    afterSelectOrganizationUrl="/watch-lists"
                    afterLeaveOrganizationUrl="/watch-lists"
                    appearance={{
                      elements: {
                        organizationSwitcherTrigger:
                          "py-2 px-2 rounded-md hover:bg-surface-soft w-full justify-start",
                        organizationPreviewAvatarBox: "h-[28px] w-[28px]",
                        organizationPreviewMainIdentifier:
                          "text-[14px] font-medium text-navy",
                      },
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <UserButton
                      showName
                      appearance={{
                        elements: {
                          userButtonTrigger:
                            "py-2 px-2 rounded-md hover:bg-surface-soft",
                          userButtonBox: "flex-row gap-2",
                          avatarBox: "h-[30px] w-[30px]",
                          userButtonOuterIdentifier:
                            "text-[14px] font-medium text-navy order-2",
                        },
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </nav>
        </>
      )}
    </>
  );
}

function HamburgerIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
