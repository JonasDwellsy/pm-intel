"use client";

// v0.23 — Sticky operator-identity bar for the scorecard.
//
// A client reviewing operators rapidly can lose track of which one
// they're deep-scrolled into. This wraps the IdentityHero and, once the
// hero scrolls up under the global nav, slides a slim bar (operator name
// + market) in just below the nav so the identity is always on screen.
//
// Implementation: an IntersectionObserver watches a zero-height sentinel
// at the bottom of the hero. rootMargin's -76px top inset matches the
// global SiteHeader height (h-[76px], sticky top-0 z-50), so the bar
// appears exactly when the hero passes behind the nav and the fixed bar
// (top-[76px], z-40) tucks directly beneath it. Wrapping the hero in a
// single div keeps the parent's space-y rhythm intact (one flow child).

import { useEffect, useRef, useState, type ReactNode } from "react";

export function StickyOperatorBar({
  name,
  location,
  children,
}: {
  name: string;
  location?: string | null;
  children: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      // -76px top inset = global nav height, so the bar reveals the moment
      // the hero clears the nav rather than the moment it leaves the page.
      { rootMargin: "-76px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div>
      {children}
      <div ref={sentinelRef} aria-hidden className="h-0 w-full" />
      <div
        aria-hidden={!pinned}
        className={`fixed inset-x-0 top-[76px] z-40 border-b border-grid bg-white/95 backdrop-blur transition-all duration-200 supports-[backdrop-filter]:bg-white/85 ${
          pinned
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1.5 opacity-0"
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] items-baseline gap-x-3 px-6 py-2.5 sm:px-10">
          <span className="truncate text-[15px] font-semibold text-navy">
            {name}
          </span>
          {location ? (
            <span className="shrink-0 text-[12.5px] text-muted-foreground">
              {location}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
