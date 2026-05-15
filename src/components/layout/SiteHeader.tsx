import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-grid bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-6 sm:px-10">
        <Link
          href="/"
          aria-label="Dwellsy IQ — PM Intel"
          className="flex items-center gap-4 text-navy"
        >
          <span className="text-2xl font-bold leading-none tracking-tight">
            <span className="text-navy">DWELLSY</span>{" "}
            <span className="text-teal">IQ</span>
          </span>
          <span aria-hidden className="h-5 w-px bg-grid" />
          <span className="text-sm font-semibold text-navy">PM Intel</span>
        </Link>
        <nav className="flex items-center gap-7">
          <Link
            href="/property-managers"
            className="text-sm font-medium text-navy transition-colors hover:text-teal"
          >
            Markets
          </Link>
          <Link
            href="/methodology"
            className="text-sm font-medium text-navy transition-colors hover:text-teal"
          >
            Methodology
          </Link>
          <Link
            href="/get-matched"
            className="inline-flex h-9 items-center justify-center rounded-md bg-navy px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-700"
          >
            Get matched
          </Link>
        </nav>
      </div>
    </header>
  );
}
