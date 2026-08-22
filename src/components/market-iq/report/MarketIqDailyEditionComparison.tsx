import type { MarketIqDailyEditionComparison } from "@/lib/market-iq/daily-edition-comparison";

function dateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function shortDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

function differenceLabel(value: number) {
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en-US")}`;
}

function unavailableCopy(comparison: MarketIqDailyEditionComparison) {
  if (comparison.state === "no_previous") {
    return {
      title: "No preceding saved edition yet",
      detail: "A comparison will appear after another persisted Daily Edition is available. Nothing has been reconstructed to fill the gap.",
    };
  }
  if (comparison.state === "current_unavailable") {
    return {
      title: "The selected edition cannot be compared",
      detail: "Its listing-event read is unavailable, so no current counts or differences are shown.",
    };
  }
  return {
    title: "The preceding edition cannot be compared",
    detail: "Its listing-event read is unavailable, so this edition is not compared with an older substitute.",
  };
}

export function MarketIqDailyEditionComparisonPanel({
  comparison,
  timeZone,
}: {
  comparison: MarketIqDailyEditionComparison;
  timeZone: string;
}) {
  if (comparison.state !== "available") {
    const copy = unavailableCopy(comparison);
    return (
      <section aria-label="Previous edition comparison" className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Previous edition comparison</p>
        <h2 className="mt-1 text-lg font-semibold text-navy">{copy.title}</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{copy.detail}</p>
        {"attemptedAt" in comparison && comparison.attemptedAt
          ? <p className="mt-2 text-[11px] text-slate-400">Read attempted {dateTime(comparison.attemptedAt, timeZone)}.</p>
          : null}
      </section>
    );
  }

  return (
    <section aria-label="Previous edition comparison" className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">Since the previous saved edition</p>
          <h2 className="mt-1 text-xl font-semibold text-navy">Observed flow, side by side</h2>
        </div>
        <p className="text-[11px] text-slate-500">
          <time dateTime={comparison.previousObservedAt}>{dateTime(comparison.previousObservedAt, timeZone)}</time>
          <span aria-hidden="true"> → </span>
          <time dateTime={comparison.currentObservedAt}>{dateTime(comparison.currentObservedAt, timeZone)}</time>
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 xl:grid-cols-5">
        {comparison.metrics.map((metric) => (
          <div key={metric.key} className="bg-white px-5 py-5">
            <dt className="text-xs font-semibold text-slate-500">{metric.label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <strong className="text-3xl font-semibold tracking-tight tabular-nums text-navy">{metric.current.toLocaleString("en-US")}</strong>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold tabular-nums ${metric.difference === 0 ? "bg-slate-100 text-slate-500" : "bg-teal-50 text-teal-800"}`}>
                {differenceLabel(metric.difference)}
              </span>
            </dd>
            <p className="mt-1 text-[10px] text-slate-400">vs. {metric.previous.toLocaleString("en-US")} on {shortDate(comparison.previousObservedAt, timeZone)}</p>
          </div>
        ))}
      </dl>
      <p className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500 sm:px-6">Differences compare two persisted 24-hour observation windows. They describe event counts only and are not a rent trend or an inference about market direction.</p>
    </section>
  );
}
