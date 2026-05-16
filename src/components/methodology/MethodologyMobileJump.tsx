"use client";

import type { TocItem } from "./MethodologyTOC";

// Mobile-only sticky jump-to-section pill. Lives at the top of the document
// below the site header — on mobile the right-rail desktop TOC collapses
// below the article so this lets readers navigate without scrolling all the
// way down to find the table of contents.
export function MethodologyMobileJump({ items }: { items: TocItem[] }) {
  function handleJump(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    el.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <div className="sticky top-[72px] z-30 border-b border-grid bg-white px-6 py-3 lg:hidden">
      <label htmlFor="methodology-mobile-jump" className="sr-only">
        Jump to section
      </label>
      <select
        id="methodology-mobile-jump"
        defaultValue=""
        onChange={handleJump}
        className="h-10 w-full appearance-none rounded-md border border-grid bg-surface-soft px-3 pr-9 text-[14px] font-medium text-navy bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22><path fill=%22none%22 stroke=%22%235C6573%22 stroke-width=%221.4%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22M1 1l4 4 4-4%22/></svg>')] bg-no-repeat bg-right-3"
      >
        <option value="" disabled>
          Jump to section…
        </option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.num} · {it.label}
          </option>
        ))}
      </select>
    </div>
  );
}
