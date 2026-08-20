import Link from "next/link";

export function MarketIqDataUnavailable({
  title = "Market data unavailable",
  detail,
  reflectedThrough,
  primaryAction,
  secondaryAction,
}: {
  title?: string;
  detail: string;
  reflectedThrough?: string | null;
  primaryAction?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-7 shadow-sm sm:p-10">
      <p className="dq-eyebrow text-amber-700">Market IQ source status</p>
      <h1 className="mt-3 text-3xl font-bold text-navy">{title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{detail}</p>
      {reflectedThrough ? (
        <p className="mt-4 text-sm font-semibold text-navy">Saved evidence reflects data through {reflectedThrough}.</p>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-7 flex flex-wrap gap-3">
          {primaryAction ? <Link href={primaryAction.href} className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white">{primaryAction.label}</Link> : null}
          {secondaryAction ? <Link href={secondaryAction.href} className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-navy">{secondaryAction.label}</Link> : null}
        </div>
      ) : null}
      <p className="mt-5 text-xs leading-5 text-slate-400">No new report was published, no email was sent, and no substitute market data was used.</p>
    </section>
  );
}
