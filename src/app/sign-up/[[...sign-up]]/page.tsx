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

export default function SignUpPage() {
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
        <SignUp fallbackRedirectUrl="/buy-boxes" signInUrl="/sign-in" />
      </div>
    </div>
  );
}
