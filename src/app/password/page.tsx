import type { Metadata } from "next";
import Image from "next/image";
import { PasswordForm } from "./PasswordForm";

// Research-preview password gate. Rendered as a full-viewport fixed overlay
// (z-[60], above the sticky SiteHeader at z-50) so the global chrome stays
// in the DOM for hydration parity but the visitor only sees the gate.
// Visitors hitting any protected route are redirected here by
// middleware.ts with ?from=<originalPath>; on success the validation
// endpoint sets dq_auth and the client redirects back to from.
//
// `noindex` because we never want search engines to surface the gate, and
// because the entire app is behind it during research preview anyway.
export const metadata: Metadata = {
  title: "Research preview access",
  robots: { index: false, follow: false },
};

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { from } = await searchParams;
  // Normalize the from-param: array → first element, undefined → "/",
  // and reject open redirects (anything not starting with "/" or that
  // looks like a protocol-relative URL).
  const raw = Array.isArray(from) ? from[0] : from;
  const safeFrom =
    raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center">
          <Image
            src="/dwellsy-iq-logo.png"
            alt="Dwellsy IQ"
            width={180}
            height={56}
            priority
            className="h-10 w-auto"
          />
        </div>

        <div className="mt-10 rounded-xl border border-grid bg-white p-7 shadow-[0_1px_0_rgb(15_31_63_/_0.02),0_8px_24px_-12px_rgb(15_31_63_/_0.08)]">
          <p className="dq-eyebrow tracking-[0.14em] text-[11px]">
            Research preview
          </p>
          <h1 className="mt-2 text-[24px] font-semibold leading-[1.15] tracking-[-0.012em] text-navy">
            Research Preview Access
          </h1>
          <p className="mt-3 text-[14.5px] leading-[1.5] text-foreground/80">
            Dwellsy IQ is currently in research preview. Enter the access
            code to view operator scorecards, market intelligence, and
            methodology.
          </p>

          <PasswordForm from={safeFrom} />
        </div>

        <p className="mt-6 text-center text-[12.5px] text-muted-foreground">
          Need an access code? Email{" "}
          <a
            href="mailto:jonas@dwellsy.com"
            className="font-semibold text-teal hover:text-teal-700"
          >
            jonas@dwellsy.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
