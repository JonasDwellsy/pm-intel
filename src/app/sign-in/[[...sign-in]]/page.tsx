import type { Metadata } from "next";
import Image from "next/image";
import { SignIn } from "@clerk/nextjs";

// /sign-in — Clerk-managed sign-in route.
//
// The catch-all [[...sign-in]] segment lets Clerk handle its
// internal sub-routes (verification, factor selection, etc.)
// under the same path. The Clerk application this app talks to
// is configured for email-OTP only (6-digit code, no password)
// matching the Dwellsy passwordless UX — that configuration
// lives in the Clerk dashboard, not in code, and Clerk's prebuilt
// <SignIn /> component automatically respects it.
//
// fallbackRedirectUrl runs when a user lands here directly (e.g.
// clicked "Sign in" in the header). When they were bounced from
// a protected route, Clerk preserves redirect_url in the query
// and routes them back there instead. The save-flow handler in
// the editor relies on that behaviour to round-trip an anonymous
// user through /sign-in and back to their template-loaded draft.

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-76px)] items-center justify-center bg-surface-soft px-6 py-12">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3 text-navy">
          <Image
            src="/dwellsy-iq-logo.png"
            alt="Dwellsy IQ"
            width={120}
            height={38}
            priority
            className="h-9 w-auto"
          />
          <span aria-hidden className="h-4 w-px bg-grid" />
          <span className="text-[13px] font-semibold tracking-[-0.005em]">
            PM Intel
          </span>
        </div>
        <SignIn fallbackRedirectUrl="/buy-boxes" signUpUrl="/sign-up" />
      </div>
    </div>
  );
}
