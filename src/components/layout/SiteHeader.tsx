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
              aspect); displayed at 32px height to match the prior wordmark
              height. width attribute is set to the corresponding aspect-
              correct width so Next/Image doesn't need to compute it from
              the file. */}
          <Image
            src="/dwellsy-iq-logo.png"
            alt="Dwellsy IQ"
            width={102}
            height={32}
            priority
            className="h-8 w-auto"
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
            href="/methodology"
            className="hidden text-sm font-medium text-navy transition-colors hover:text-teal sm:inline-block"
          >
            Methodology
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
