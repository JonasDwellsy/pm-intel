import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Dwellsy IQ</span>
          <span className="text-sm text-muted-foreground">PM Intel</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/property-managers"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Markets
          </Link>
          <Link
            href="/methodology"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Methodology
          </Link>
          <Link
            href="/get-matched"
            className="rounded-md bg-foreground px-3 py-1.5 text-background transition-opacity hover:opacity-90"
          >
            Get matched
          </Link>
        </nav>
      </div>
    </header>
  );
}
