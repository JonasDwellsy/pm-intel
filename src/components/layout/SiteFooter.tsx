import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Dwellsy. All data via Dwellsy IQ.</p>
        <nav className="flex gap-4">
          <Link href="/methodology" className="hover:text-foreground">
            Methodology
          </Link>
          <Link href="/property-managers" className="hover:text-foreground">
            Markets
          </Link>
        </nav>
      </div>
    </footer>
  );
}
