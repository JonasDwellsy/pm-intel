"use client";

import { useEffect, useRef, useState } from "react";

export type TocItem = {
  id: string;
  num: string;
  label: string;
};

// Sticky right-rail TOC with IntersectionObserver scroll-spy and a mobile
// `<select>` fallback that scrolls smoothly to the chosen section.
export function MethodologyTOC({
  items,
  version,
  dataAsOfLabel,
}: {
  items: TocItem[];
  version: string;
  dataAsOfLabel: string;
}) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Scroll-spy: pick the section whose top is closest to the viewport top.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections: HTMLElement[] = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    const visibleMap = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleMap.set(entry.target.id, entry);
          } else {
            visibleMap.delete(entry.target.id);
          }
        }
        if (visibleMap.size > 0) {
          // Pick the topmost intersecting section
          const topmost = Array.from(visibleMap.values()).sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top
          )[0];
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 }
    );
    sections.forEach((s) => observer.observe(s));
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [items]);

  function handleCopy() {
    const citation = `Dwellsy IQ, 2026. PM Intel Methodology ${version}. iq.dwellsy.com/methodology`;
    void navigator.clipboard.writeText(citation).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <aside className="hidden lg:block">
        <div className="sticky top-24">
          {/* TOC */}
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            On this page
          </p>
          <nav
            aria-label="Methodology table of contents"
            className="border-l border-grid"
          >
            <ul className="flex flex-col">
              {items.map((it) => {
                const isActive = activeId === it.id;
                return (
                  <li key={it.id} className="relative">
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-[-1px] top-0 h-full w-[2px] bg-teal"
                      />
                    )}
                    <a
                      href={`#${it.id}`}
                      className={
                        "flex items-baseline gap-3 py-1.5 pl-5 text-[13.5px] transition-colors " +
                        (isActive
                          ? "font-semibold text-navy"
                          : "font-medium text-muted-foreground hover:text-navy")
                      }
                    >
                      <span
                        className={
                          "dq-mono w-[22px] text-[11px] tracking-[0.04em] " +
                          (isActive ? "text-teal" : "text-muted-2")
                        }
                      >
                        {it.num}
                      </span>
                      <span>{it.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Cite block */}
          <div className="mt-8 rounded-md border border-grid bg-surface-soft p-4">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Cite this methodology
            </p>
            <p className="dq-mono text-[11.5px] leading-[1.5] text-navy">
              Dwellsy IQ, 2026.{" "}
              <em>PM Intel Methodology {version}</em>.
              iq.dwellsy.com/methodology
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-teal transition-colors hover:text-teal-700"
            >
              <svg
                aria-hidden
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? "✓ Copied" : "Copy citation"}
            </button>
          </div>

          {/* Actions stack */}
          <div className="mt-5 flex flex-col gap-2.5">
            <a
              href="#"
              aria-label="Download methodology as PDF"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-navy px-4 text-[13px] font-semibold text-white transition-colors hover:bg-navy-700"
            >
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download as PDF
            </a>
            <a
              href="mailto:pmintel@dwellsy.com"
              className="inline-flex items-center gap-1.5 px-1 py-1 text-[13px] font-semibold text-teal transition-colors hover:text-teal-700"
            >
              Email the methodology team →
            </a>
          </div>

          {/* Footer hint */}
          <p className="mt-6 text-[11px] text-muted-2">
            Last reviewed {dataAsOfLabel}
          </p>
        </div>
      </aside>
  );
}
