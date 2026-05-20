"use client";

import { capture } from "@/lib/analytics";

// Replaces the old DownloadPdfLink. Two reasons for the switch:
//
//   1. The react-pdf scorecard tree drifted from the v1.0 / v0.6.4
//      design. Maintaining two render paths (live page + PDF tree) for
//      every spec change was the wrong long-term cost.
//   2. window.print() lets the browser drive the conversion. The system
//      print dialog includes "Save as PDF" as a destination on every
//      modern browser, so the prospect still gets a PDF — they just
//      pick the destination themselves. The output reflects the live
//      page, so every future scorecard design change flows through
//      automatically.
//
// The button itself is hidden in @media print via the .dq-no-print
// class so it doesn't appear in the printed output. Analytics keeps
// the same event name (pdf_export_click) so historical dashboards
// stay continuous.
export function PrintScorecardButton({
  pmSlug,
  className,
}: {
  pmSlug: string;
  className?: string;
}) {
  function handleClick() {
    capture("pdf_export_click", { pmSlug });
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        "dq-no-print inline-flex h-9 w-full items-center justify-center rounded-md border border-grid bg-white px-4 text-[13px] font-semibold text-navy transition-colors hover:bg-navy-soft" +
        (className ? ` ${className}` : "")
      }
    >
      Print / Save as PDF
    </button>
  );
}
