import Image from "next/image";
import Link from "next/link";
import { FOOTER_LINKS } from "@/lib/nav";
import { METHODOLOGY_VERSION, DESIGN_VERSION } from "@/lib/version";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-18 border-t border-grid bg-white">
      <div className="mx-auto max-w-[1440px] px-6 pt-7 pb-6 sm:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* PR #46 — footer uses the same logo asset as SiteHeader.
              Sized smaller (h-7 vs h-12) so the footer keeps its
              compact one-line layout. The PM Intel sub-label sits
              next to the logo on a thin divider, matching the
              header's "Dwellsy IQ | PM Intel" stack visually. */}
          <Link
            href="/"
            aria-label="Dwellsy IQ — PM Intel"
            className="flex items-center gap-3 text-navy"
          >
            <Image
              src="/dwellsy-iq-logo.png"
              alt="Dwellsy IQ"
              width={90}
              height={28}
              className="h-7 w-auto"
            />
            <span aria-hidden className="h-3.5 w-px bg-grid" />
            <span className="text-xs text-muted-foreground">PM Intel</span>
          </Link>
          <p className="text-xs text-muted-foreground dq-tnum">
            Methodology {METHODOLOGY_VERSION}
            <span className="mx-1.5 text-muted-2">·</span>
            Design {DESIGN_VERSION}
            <span className="mx-1.5 text-muted-2">·</span>
            Confidential
            <span className="mx-1.5 text-muted-2">·</span>
            For institutional use only
          </p>
        </div>
        <nav className="mt-5 flex flex-wrap gap-6 text-xs text-muted-foreground">
          {FOOTER_LINKS.map((l) => {
            // mailto: links don't need target=_blank (the OS handles
            // them), but cross-origin web URLs do. Distinguish on the
            // protocol so both flavors of "external" route correctly.
            const isWebExternal =
              l.external && !l.href.startsWith("mailto:");
            return l.external ? (
              <a
                key={l.label}
                href={l.href}
                className="hover:text-navy"
                {...(isWebExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {l.label}
              </a>
            ) : (
              <Link key={l.label} href={l.href} className="hover:text-navy">
                {l.label}
              </Link>
            );
          })}
          <span className="text-muted-2">© {year} Dwellsy, Inc.</span>
        </nav>
      </div>
    </footer>
  );
}
