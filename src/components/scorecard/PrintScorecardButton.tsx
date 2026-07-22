"use client";

import { capture } from "@/lib/analytics";

// PR #84 — Replaces the old window.print() flow with a branded
// purpose-built PDF.
//
// History:
//   - Original implementation rendered a parallel @react-pdf tree
//     that drifted from the v1.0 / v0.6.4 design (maintaining two
//     renderers for every spec change was the wrong long-term cost).
//   - PR #70 switched to window.print() + a print stylesheet, which
//     fixed the drift problem by reusing the live page DOM. But
//     "Save as PDF" through the browser print dialog produces
//     inconsistent output across browsers + OS combinations, and
//     the artifact isn't ideal for a deal-room share (page chrome,
//     headers, nav links visible at the edges).
//   - PR #84 returns to a purpose-built PDF but as a single
//     server-rendered route (/api/scorecard/[slug]/pdf) that we
//     own end-to-end. Visual brand matches the OG image (PR #75)
//     and the live scorecard (Layer 1 → 5). Output is deterministic
//     across browsers because Chrome/Safari/Firefox aren't involved.
//
// Analytics: kept the `pdf_export_click` event name verbatim so
// historical PostHog dashboards stay continuous across the
// implementation change.

export function PrintScorecardButton({
  pmSlug,
  className,
  compact = false,
}: {
  pmSlug: string;
  className?: string;
  compact?: boolean;
}) {
  function handleClick() {
    capture("pdf_export_click", { pmSlug });
    // The <a> element below already triggers the download via the
    // browser; we just emit the analytics event on click.
  }

  return (
    <a
      href={`/api/scorecard/${pmSlug}/pdf`}
      download
      onClick={handleClick}
      title="Download PDF"
      aria-label="Download scorecard PDF"
      className={
        (compact
          ? "dq-no-print inline-flex h-7 w-7 items-center justify-center rounded-full border border-grid bg-white text-muted-foreground transition-colors hover:border-navy hover:text-navy"
          : "dq-no-print inline-flex h-9 items-center justify-center rounded-md border border-grid bg-white px-4 text-[13px] font-semibold text-navy transition-colors hover:bg-navy-soft") +
        (className ? ` ${className}` : "")
      }
    >
      {compact ? <DownloadIcon /> : "Download PDF"}
    </a>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M7 12l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
