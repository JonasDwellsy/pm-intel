import type { Metadata } from "next";
import Image from "next/image";
import { SignUp } from "@clerk/nextjs";

// /sign-up — Clerk-managed sign-up route.
//
// Mirrors /sign-in (same branded wrapper, same fallback redirect)
// but renders Clerk's <SignUp /> component instead. Email-OTP
// configuration is owned by the Clerk dashboard; the prebuilt
// component picks it up automatically.

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

// v0.20 — minimal auth layout. Mirrors /sign-in (see that file for the
// full rationale): SiteHeader/SiteFooter stripped by ConditionalChrome,
// single brand anchor + concise heading, Clerk's internal logo + title
// hidden via appearance.
const clerkAppearance = {
  elements: {
    logoBox: "hidden",
    headerTitle: "hidden",
    headerSubtitle: "hidden",
    card: "shadow-none border border-grid",
    formButtonPrimary:
      "bg-navy hover:bg-navy-700 text-white text-[13px] font-semibold",
  },
} as const;

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft px-6 py-12">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-7">
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
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-navy">
            Create your account
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Get started with PM Intel.
          </p>
        </div>
        <SignUp
          fallbackRedirectUrl="/watch-lists"
          signInUrl="/sign-in"
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
