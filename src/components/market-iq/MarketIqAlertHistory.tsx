import type { MarketIqAlertHistoryItem } from "@/lib/market-iq/alert-history.server";

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(value));
}

export function MarketIqAlertHistory({ alerts }: { alerts: MarketIqAlertHistoryItem[] }) {
  return (
    <section aria-labelledby="alert-history-heading" className="mt-10 rounded-lg border border-grid bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="dq-eyebrow">Alert history</p>
          <h2 id="alert-history-heading" className="dq-h2">What changed in your watchlists</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Alerts appear when an authoritative trend update crosses a Market IQ threshold and matches a saved monitoring scope.
          </p>
        </div>
        <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-semibold text-muted-foreground">
          {alerts.length} matched {alerts.length === 1 ? "alert" : "alerts"}
        </span>
      </div>
      {alerts.length ? (
        <div className="mt-6 divide-y divide-grid">
          {alerts.map((alert) => (
            <article key={alert.id} className="grid gap-3 py-5 first:pt-0 last:pb-0 lg:grid-cols-[160px_1fr_auto] lg:items-start">
              <div>
                <p className="text-sm font-semibold text-navy">{alert.geographyLabel}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">{alert.segmentLabel} · {monthLabel(alert.observedMonth)}</p>
              </div>
              <div>
                <h3 className="font-semibold text-navy">{alert.headline}</h3>
                <p className="mt-1 text-sm leading-6 text-foreground/75">{alert.narrative}</p>
                <p className="mt-2 text-xs text-muted-foreground">Matches {alert.watchlistNames.join(", ")}</p>
              </div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${alert.severity === "material" ? "bg-orange-soft text-orange-700" : "bg-teal-soft text-teal"}`}>
                {alert.severity}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-lg bg-surface-soft p-4 text-sm text-muted-foreground">
          No alerts match your saved watchlists yet. Alerts will appear here after a saved scope crosses a threshold.
        </p>
      )}
    </section>
  );
}
