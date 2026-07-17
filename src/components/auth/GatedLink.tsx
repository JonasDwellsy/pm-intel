"use client";

// A link to gated (sign-in-required) content that avoids the jarring
// full-page bounce for in-app clicks. Signed-in users get the normal tracked
// link; signed-out users get a button that opens the Clerk sign-in modal in
// place — no navigation — and returns them to `href` after they authenticate
// (forceRedirectUrl).
//
// Direct/shared links to the same gated URL still hit the middleware redirect
// and land on the (contextual) /sign-in page — a server redirect can't open a
// client modal — so this only smooths the in-app path.
//
// While Clerk is resolving auth state (isSignedIn === undefined) we render the
// plain link: signed-in users never flicker to a button, and a confirmed-anon
// user only degrades to the contextual bounce page during that brief window.
import { useAuth, SignInButton } from "@clerk/nextjs";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import type { EventName, EventProps } from "@/lib/analytics";

interface GatedLinkProps {
  href: string;
  className?: string;
  /** Analytics event fired on the signed-in link (same as TrackedLink). */
  event: EventName;
  properties?: EventProps;
  /** Accessible label for the signed-out button — the visible children are
   *  usually a rich card, so give the control a concise name. */
  ariaLabel?: string;
  children: React.ReactNode;
}

export function GatedLink({
  href,
  className,
  event,
  properties,
  ariaLabel,
  children,
}: GatedLinkProps) {
  const { isSignedIn } = useAuth();

  if (isSignedIn === false) {
    return (
      <SignInButton mode="modal" forceRedirectUrl={href}>
        <button
          type="button"
          aria-label={ariaLabel}
          className={`w-full cursor-pointer text-left ${className ?? ""}`}
        >
          {children}
        </button>
      </SignInButton>
    );
  }

  return (
    <TrackedLink
      event={event}
      properties={properties}
      href={href}
      className={className}
    >
      {children}
    </TrackedLink>
  );
}
