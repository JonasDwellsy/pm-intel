// v0.31 — White-label chrome for the consumer /report funnel. Wraps every
// funnel page with a partner-branded header + footer and sets the accent CSS
// variables (--report-accent / --report-accent-fg) that the funnel's primary
// CTAs read. Server component; theme resolved from the partner slug.
//
// The B2B SiteHeader/SiteFooter are stripped on /report (see ConditionalChrome
// BARE_ROUTES), so this shell is the only chrome a funnel visitor sees.

import type { CSSProperties } from "react";
import Link from "next/link";
import { resolvePartner } from "@/lib/report/partners";
import { buildReportQuery } from "@/lib/report/query";

export function ReportShell({
  partner,
  token,
  children,
}: {
  partner?: string | null;
  token?: string | null;
  children: React.ReactNode;
}) {
  const theme = resolvePartner(partner);
  const style = {
    "--report-accent": theme.accent,
    "--report-accent-fg": theme.accentFg,
  } as CSSProperties;
  const partnerSlug = theme.slug !== "default" ? theme.slug : null;
  // Two suffixes on purpose. The logo goes to the PUBLIC landing page, which
  // has no use for an identity — and that is the URL most likely to be shared
  // or screenshotted, so the guest's token stays off it. The wallet link is
  // the opposite: a guest has no session, so without the token it lands them
  // on "open this page from your emailed link" while they are holding a
  // perfectly good one.
  const partnerQuery = buildReportQuery({ partner: partnerSlug });
  const walletQuery = buildReportQuery({ token, partner: partnerSlug });

  return (
    <div style={style} className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-grid bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <Link href={`/report${partnerQuery}`} className="flex items-baseline gap-2">
            <span
              className="text-[18px] font-bold tracking-tight"
              style={{ color: "var(--report-accent)" }}
            >
              {theme.brandName}
            </span>
            <span className="text-[13px] font-medium text-muted-foreground">
              {theme.productLabel}
            </span>
          </Link>
          {theme.showPoweredBy && (
            <span className="text-[12px] text-muted-foreground">
              Powered by <span className="font-semibold text-foreground/80">Dwellsy Operator IQ</span>
            </span>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-grid bg-white">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-6 py-6 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Independent property-manager intelligence from{" "}
            <span className="font-medium text-foreground/80">Dwellsy Operator IQ</span>.
            Measured from observed listing activity — not paid for by the managers we rate.
          </p>
          <nav className="flex gap-4">
            <Link href="/methodology" className="hover:underline">How we measure</Link>
            <Link href={`/report/account${walletQuery}`} className="hover:underline">Your reports</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
