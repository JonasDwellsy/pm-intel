import Image from "next/image";
import Link from "next/link";
import { SearchInput } from "@/components/search/SearchInput";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-grid bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-6 sm:px-10">
        <Link
          href="/"
          aria-label="Dwellsy IQ — PM Intel"
          className="flex items-center gap-4 text-navy"
        >
          {/* Real Dwellsy IQ brand logo. Native asset is 1000×313 (3.2:1
              aspect); displayed at 48px height (h-12) so the "IQ"
              character height visually matches the 36px Get Matched
              button. Width 153 keeps the 3.2:1 aspect ratio so the
              <Image> layout calculation doesn't trigger a reflow.
              Bumped from h-8 (32px) in the UI polish pass — the
              prior size was too compressed against the surrounding
              nav typography. Header retains its h-[76px] frame
              (48 + 14px top/bottom padding leaves comfortable air). */}
          <Image
            src="/dwellsy-iq-logo.png"
            alt="Dwellsy IQ"
            width={153}
            height={48}
            priority
            className="h-12 w-auto"
          />
          <span aria-hidden className="h-5 w-px bg-grid" />
          <span className="text-sm font-semibold text-navy">PM Intel</span>
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            href="/property-managers"
            className="hidden text-sm font-medium text-navy transition-colors hover:text-teal sm:inline-block"
          >
            Markets
          </Link>
          <Link
            href="/briefs"
            className="hidden text-sm font-medium text-navy transition-colors hover:text-teal sm:inline-block"
          >
            Briefs
          </Link>
          <Link
            href="/methodology"
            className="hidden text-sm font-medium text-navy transition-colors hover:text-teal sm:inline-block"
          >
            Methodology
          </Link>
          {/* Ask Dwellsy IQ — natural-language interface. AI badge signals
              this is a new feature (Claude tool-calling against the
              scorecard data). Same hover/transition treatment as the
              other nav links. */}
          <Link
            href="/ask"
            className="hidden items-center gap-1.5 text-sm font-medium text-navy transition-colors hover:text-teal sm:inline-flex"
          >
            Ask
            <span
              aria-hidden
              className="inline-flex h-4 items-center rounded-sm bg-teal px-1 text-[9px] font-bold uppercase tracking-[0.06em] text-white"
            >
              AI
            </span>
          </Link>
          {/* v0.7 search — top-nav PM autocomplete. Hidden on the
              narrowest viewports where the input doesn't fit; Cmd+K
              still works to invoke the modal from anywhere. */}
          <div className="hidden md:block">
            <SearchInput />
          </div>
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
