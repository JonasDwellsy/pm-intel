import type {
  MarketIqResolutionSegment,
  MarketIqTimeToResolutionAvailability,
} from "@/lib/market-iq/time-to-resolution";

function date(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

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

function dayValue(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} days`;
}

function SegmentTable({ title, segments }: { title: string; segments: MarketIqResolutionSegment[] }) {
  return <section aria-label={title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
      <h3 className="font-semibold text-[var(--report-primary)]">{title}</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
          <tr><th className="px-5 py-3">Segment</th><th className="px-3 py-3 text-right">Median</th><th className="px-3 py-3 text-right">Middle 50%</th><th className="px-5 py-3 text-right">Sample</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {segments.map((segment) => <tr key={segment.key}>
            <th scope="row" className="px-5 py-3.5 font-medium text-slate-700">{segment.label}</th>
            <td className="px-3 py-3.5 text-right font-semibold text-[var(--report-primary)]">{dayValue(segment.medianDays)}</td>
            <td className="px-3 py-3.5 text-right text-slate-500">{segment.p25Days.toLocaleString()}–{segment.p75Days.toLocaleString()} days</td>
            <td className="px-5 py-3.5 text-right text-slate-500">{segment.sampleSize.toLocaleString()}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

export function MarketIqTimeToResolution({
  availability,
  marketName = "the market",
  timeZone = "America/New_York",
}: {
  availability: MarketIqTimeToResolutionAvailability;
  marketName?: string;
  timeZone?: string;
}) {
  if (availability.state === "unavailable") {
    return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-7 sm:p-9" aria-label={`Time to resolution in ${marketName} unavailable`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Weekly market benchmark</p>
      <h2 className="mt-2 text-2xl font-semibold text-[var(--report-primary)]">Time-to-resolution data is unavailable.</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">The inactive-listing source read failed. No monthly trend, active-listing estimate, seeded example, or other substitute is shown.</p>
      <p className="mt-3 text-xs text-slate-500">Read attempted {dateTime(availability.attemptedAt, timeZone)}.</p>
    </section>;
  }

  const resolution = availability.resolution;
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]" aria-label={`Time to resolution in ${marketName}`}>
    <div className="grid gap-7 bg-[var(--report-primary)] p-7 text-white sm:p-9 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Weekly market benchmark</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Time to resolution</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Elapsed time from a listing’s recorded creation to its observed deactivation. An inactive listing may have leased or been withdrawn, so this is not time to lease.</p>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">Median</dt><dd className="mt-1 text-3xl font-semibold">{dayValue(resolution.medianDays)}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">Middle 50%</dt><dd className="mt-1 text-lg font-semibold">{resolution.p25Days.toLocaleString()}–{resolution.p75Days.toLocaleString()} days</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">90th percentile</dt><dd className="mt-1 text-lg font-semibold">{dayValue(resolution.p90Days)}</dd></div>
        <div><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">Resolved listings</dt><dd className="mt-1 text-lg font-semibold">{resolution.sampleSize.toLocaleString()}</dd></div>
      </dl>
    </div>
    <div className="p-7 sm:p-9">
      <div className="grid gap-5 xl:grid-cols-2">
        <SegmentTable title="By property type and bedrooms" segments={resolution.bedroomSegments} />
        <SegmentTable title="By advertised asking-rent band" segments={resolution.rentBands} />
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500 sm:flex-row sm:items-start sm:justify-between">
        <p>Trailing 90-day cohort, {date(resolution.windowStart, timeZone)} through {date(resolution.windowEnd, timeZone)}. Segments with fewer than 25 observations are withheld.</p>
        <p className="shrink-0">Source current through {dateTime(resolution.asOf, timeZone)}</p>
      </div>
    </div>
  </section>;
}
