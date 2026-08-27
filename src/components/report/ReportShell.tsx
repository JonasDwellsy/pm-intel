// v0.34 — White-label chrome for the consumer /report funnel. Wraps every
// funnel page with a branded header + footer and sets the accent CSS variables
// (--report-accent / --report-accent-fg) the funnel's CTAs read. Server
// component. The default (Dwellsy) theme leads with the Dwellsy IQ logo; a
// partner theme leads with the partner wordmark and carries a "Powered by
// Dwellsy IQ" mark. The B2B SiteHeader/SiteFooter are stripped on /report (see
// ConditionalChrome), so this is the only chrome a funnel visitor sees.

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolvePartner } from "@/lib/report/partners";

function DwellsyLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/dwellsy-iq-logo.png"
      alt="Dwellsy IQ"
      width={153}
      height={48}
      priority
      className={className ?? "h-8 w-auto"}
    />
  );
}

export function ReportShell({
  partner,
  children,
}: {
  partner?: string | null;
  children: React.ReactNode;
}) {
  const theme = resolvePartner(partner);
  const isPartner = theme.slug !== "default";
  const style = {
    "--report-accent": theme.accent,
    "--report-accent-fg": theme.accentFg,
  } as CSSProperties;
  const q = isPartner ? `?partner=${theme.slug}` : "";

  return (
    <div style={style} className="flex min-h-full flex-1 flex-col">
      {/* Header */}
      <header className="border-b border-grid bg-white">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 py-4">
          {isPartner ? (
            <>
              <Link href={`/report${q}`} className="flex items-baseline gap-2">
                <span
                  className="text-[19px] font-bold tracking-tight"
                  style={{ color: "var(--report-accent)" }}
                >
                  {theme.brandName}
                </span>
                <span className="text-[13px] font-medium text-muted-foreground">
                  {theme.productLabel}
                </span>
              </Link>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                Powered by
                <DwellsyLogo className="h-5 w-auto" />
              </span>
            </>
          ) : (
            <>
              <Link
                href={`/report${q}`}
                aria-label="Dwellsy IQ — Operator IQ"
                className="flex items-center gap-3"
              >
                <DwellsyLogo className="h-8 w-auto sm:h-9" />
                <span aria-hidden className="h-5 w-px bg-grid" />
                <span className="text-[14px] font-semibold text-navy">
                  Operator IQ
                </span>
              </Link>
              <span className="hidden text-[12.5px] text-muted-foreground sm:inline">
                Property-manager intelligence, for owners
              </span>
            </>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      {/* Footer */}
      <footer className="border-t border-grid bg-white">
        <div className="mx-auto max-w-[1100px] px-6 py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[42ch]">
              <DwellsyLogo className="h-7 w-auto" />
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                Operator IQ scores property managers from observed rental-listing
                activity across U.S. markets. Independent, and never paid for by
                the managers we rate.
              </p>
            </div>
            <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-[13px] sm:text-right">
              <Link href="/sample" className="text-foreground/80 hover:text-teal">Sample report</Link>
              <Link href="/methodology" className="text-foreground/80 hover:text-teal">How we measure</Link>
              <Link href={`/report/account${q}`} className="text-foreground/80 hover:text-teal">Manage subscription</Link>
              <Link href="/terms" className="text-foreground/80 hover:text-teal">Terms</Link>
              <Link href="/privacy" className="text-foreground/80 hover:text-teal">Privacy</Link>
            </nav>
          </div>
          <p className="mt-6 border-t border-grid pt-4 text-[11.5px] text-muted-foreground">
            © Dwellsy, Inc. A product of Dwellsy IQ.
          </p>
        </div>
      </footer>
    </div>
  );
}
