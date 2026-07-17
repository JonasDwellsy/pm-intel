import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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

// v0.20 — minimal auth "doorway" layout. SiteHeader + SiteFooter are stripped
// on this route by ConditionalChrome (the deliberate Stripe/Linear/Vercel
// pattern — auth is a focused transactional flow, not part of the browsable
// app), so the page owns the full viewport. The brand logo (a link back to the
// site) + one concise heading are the only branding; Clerk's built-in logo +
// "Sign in to {appName}" title are hidden so we don't stack marks. Card border
// + navy button now come from the global appearance on <ClerkProvider>
// (src/lib/clerk-appearance.ts) — shared with the sign-in modal — so this page
// only adds the page-specific hides.
const clerkAppearance = {
  elements: {
    logoBox: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
  },
} as const;

// Contextual heading based on where the middleware bounced the visitor FROM
// (Clerk preserves it as ?redirect_url). Turns a generic "Sign in" dead-end
// into "sign in to see the specific thing you clicked", and Clerk still routes
// them back there after auth. Order matters: /brief is a 4-segment path that
// also matches the scorecard pattern, so test it first.
function signInContext(redirectUrl: string | undefined): {
  title: string;
  sub: string;
} {
  const url = redirectUrl ?? "";
  if (/\/property-managers\/[^/]+\/[^/]+\/brief/.test(url))
    return {
      title: "Sign in to read this brief",
      sub: "Market briefs are available to signed-in members.",
    };
  if (/\/property-managers\/[^/]+\/[^/]+\/[^/]+/.test(url))
    return {
      title: "Sign in to view this scorecard",
      sub: "Full operator scorecards are available to signed-in members.",
    };
  if (url.includes("/operators/"))
    return {
      title: "Sign in to view this operator",
      sub: "Operator profiles are available to signed-in members.",
    };
  if (url.includes("/ask"))
    return {
      title: "Sign in to use Ask Dwellsy IQ",
      sub: "The AI research tool is available to signed-in members.",
    };
  if (url.includes("/watch-lists"))
    return {
      title: "Sign in to open your watch lists",
      sub: "Your saved watch lists are waiting.",
    };
  return { title: "Sign in", sub: "Welcome back — continue to Operator IQ." };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  const ctx = signInContext(redirect_url);
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft px-6 py-12">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-7">
        {/* Single brand anchor for the whole page — links back to the
            site so the chromeless doorway still has a way home. */}
        <Link
          href="/"
          className="flex items-center gap-3 text-navy transition-opacity hover:opacity-80"
        >
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
            Operator IQ
          </span>
        </Link>
        {/* One concise heading — replaces Clerk's verbose
            "Sign in to Operator IQ from Dwellsy IQ" title. */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-navy">
            {ctx.title}
          </h1>
          <p className="text-[14px] text-muted-foreground">{ctx.sub}</p>
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
