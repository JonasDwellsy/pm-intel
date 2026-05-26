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

// v0.20 — minimal auth layout. SiteHeader + SiteFooter are stripped on
// this route by ConditionalChrome, so the page owns the full viewport
// (min-h-screen, not the old 76px-header offset). The brand logo + a
// single concise heading below it are the ONLY branding on the page;
// Clerk's built-in logo + "Sign in to {appName}" title are hidden via
// appearance so we don't stack three Dwellsy IQ marks on top of each
// other. The card then renders just the email form.
const clerkAppearance = {
  elements: {
    // Hide Clerk's internal logo + header text — our page-level brand
    // mark + heading above carry the context, single source of truth.
    logoBox: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    // Match the card to the rest of the app's visual language: flat
    // border instead of Clerk's default drop shadow, navy primary
    // button.
    card: "shadow-none border border-grid",
    formButtonPrimary:
      "bg-navy hover:bg-navy-700 text-white text-[13px] font-semibold",
  },
} as const;

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft px-6 py-12">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-7">
        {/* Single brand anchor for the whole page. */}
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
        {/* One concise heading — replaces Clerk's verbose
            "Sign in to PM Intel from Dwellsy IQ" title. */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-navy">
            Sign in
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Welcome back — continue to PM Intel.
          </p>
        </div>
        <SignIn
          fallbackRedirectUrl="/watch-lists"
          signUpUrl="/sign-up"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
