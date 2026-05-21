import Link from "next/link";
import { FOOTER_LINKS } from "@/lib/nav";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-18 border-t border-grid bg-white">
      <div className="mx-auto max-w-[1440px] px-6 pt-7 pb-6 sm:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-navy">
            <strong className="font-semibold">Dwellsy IQ</strong>
            <span className="mx-2 text-muted-2">·</span>
            <span className="text-muted-foreground">PM Intel</span>
          </p>
          <p className="text-xs text-muted-foreground dq-tnum">
            Methodology v0.8
            <span className="mx-1.5 text-muted-2">·</span>
            Design v1.0
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
