// v0.30 — Confidence-tier badge for the consumer funnel. Server component.

import type { ReportTierInfo } from "@/lib/report/confidence-tier";

export function ConfidenceBadge({
  info,
  showBlurb = false,
}: {
  info: ReportTierInfo;
  showBlurb?: boolean;
}) {
  const tone =
    info.tier === "profile"
      ? "bg-slate-100 text-slate-700 ring-slate-200"
      : info.confidence === "high"
        ? "bg-teal-soft text-teal ring-teal/20"
        : "bg-amber-50 text-amber-700 ring-amber-200";

  const text =
    info.tier === "profile"
      ? "Profile"
      : `Ranked · ${info.confidenceLabel}`;

  return (
    <span className="inline-flex flex-col gap-1">
      <span
        className={`inline-flex h-[22px] w-fit items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset ${tone}`}
      >
        {text}
      </span>
      {showBlurb && (
        <span className="max-w-[42ch] text-[12.5px] leading-snug text-muted-foreground">
          {info.blurb}
        </span>
      )}
    </span>
  );
}
