// v0.30 — Thin bar above a purchased report: PDF download for durable buyers,
// or a "check your inbox" note for the immediate post-checkout view (the
// webhook is still writing the durable grant + emailing the links). Server
// component; links only.

export function ReportToolbar({
  slug,
  token,
  durable,
}: {
  slug: string;
  token?: string | null;
  durable: boolean;
}) {
  const pdfHref = `/api/report/${slug}/pdf${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  return (
    <div className="border-b border-grid bg-white">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-[13px] text-foreground/80">
          <span className="inline-flex h-[22px] items-center rounded-full bg-teal-soft px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-teal">
            Your report
          </span>
          {durable ? (
            <span>Full access — yours to revisit anytime.</span>
          ) : (
            <span>
              Payment received. Your report link and a PDF copy are on their way
              to your inbox.
            </span>
          )}
        </p>
        {durable && (
          <a
            href={pdfHref}
            className="inline-flex h-9 items-center justify-center rounded-md border border-navy bg-white px-4 text-[13px] font-semibold text-navy transition-colors hover:bg-navy-soft"
          >
            Download PDF
          </a>
        )}
      </div>
    </div>
  );
}
