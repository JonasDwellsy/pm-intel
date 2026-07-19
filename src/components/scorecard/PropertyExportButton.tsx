"use client";

// Task 5 — Properties section export control. Styled like
// src/components/watch-list/DownloadButton.tsx, but simpler: there's no
// client-side workbook to build (the /api/scorecard/[slug]/properties route
// already returns the finished .xlsx), so this is a plain anchor with a
// `Content-Disposition: attachment` response driving the download — no
// dynamic import, no loading state, no fetch.

interface Props {
  slug: string;
}

export function PropertyExportButton({ slug }: Props) {
  return (
    <a
      href={`/api/scorecard/${slug}/properties`}
      download
      className="h-9 inline-flex items-center gap-1.5 rounded-md border border-grid bg-white px-3.5 text-[13px] font-medium text-navy hover:bg-surface-soft"
    >
      <DownloadIcon />
      <span>Export</span>
    </a>
  );
}

function DownloadIcon() {
  // Inline SVG matching DownloadButton.tsx's icon (no-lucide convention).
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
