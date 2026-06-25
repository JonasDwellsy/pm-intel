import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

// v0.21 — /sign-up — contact-sales page.
//
// Self-serve signup closed for the first-paying-customer launch.
// Replaces the previous Clerk <SignUp /> form with a friendly
// "by invitation only" message + a mailto link to sales. The route
// stays alive (rather than 404'ing) for two reasons:
//
//   1. /sign-in's <SignIn signUpUrl="/sign-up"> renders a
//      "Don't have an account? Sign up" link at the bottom; that
//      link now lands here and explains the model.
//   2. Anyone who typed /sign-up directly or has it bookmarked
//      from before the launch gets a useful answer rather than a
//      dead end.
//
// The Clerk dashboard's instance-level "Sign-up enabled" toggle
// should ALSO be flipped off so any direct attempts at Clerk's
// hosted sign-up surface fail. That's an out-of-code config step
// for the launch.

const SALES_EMAIL = "sales@dwellsy.com";

export const metadata: Metadata = {
  title: "Contact sales",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-soft px-6 py-12">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-7">
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

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-navy">
            By invitation only
          </h1>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            PM Intel is currently sold through enterprise sales —
            self-serve signup is closed. Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-semibold text-navy underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
            .
          </p>
        </div>

        <div className="w-full rounded-[12px] border border-grid bg-white p-6 text-center">
          <p className="text-[13px] text-muted-foreground mb-3">
            Interested in access for your team?
          </p>
          <a
            href={`mailto:${SALES_EMAIL}?subject=PM%20Intel%20enterprise%20access`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-navy px-5 text-[14px] font-semibold text-white hover:bg-navy-700"
          >
            Contact sales
          </a>
          <p className="text-[12px] text-muted-2 mt-3">
            Or email{" "}
            <a
              href={`mailto:${SALES_EMAIL}`}
              className="text-navy underline-offset-2 hover:underline"
            >
              {SALES_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
