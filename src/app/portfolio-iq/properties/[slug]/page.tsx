import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadPortfolioIqProperty } from "@/lib/portfolio-iq/property.server";
import { portfolioDecisionLabel } from "@/lib/portfolio-iq/decision";
import { updatePortfolioSignalDecision } from "../../actions";

export const dynamic = "force-dynamic";

function dollars(value: number | null): string {
  return value === null ? "Insufficient data" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function decimalDollars(value: number | null): string {
  return value === null ? "Insufficient data" : `$${value.toFixed(2)}`;
}

function percent(value: number | null): string {
  if (value === null) return "Insufficient data";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function dateLabel(value: Date | string | null | undefined): string {
  if (!value) return "Not observed";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function comparisonTone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (Math.abs(value) < 3) return "text-navy";
  return value > 0 ? "text-orange-700" : "text-teal-700";
}

function MetricCard({ label, value, detail, tone = "text-navy" }: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <article className="rounded-lg border border-grid bg-white p-5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className={`mt-3 text-[26px] font-semibold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

export default async function PortfolioIqPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!portfolioIqPreviewEnabled()) notFound();
  if (!(await viewerHasProductAccess("portfolio_iq"))) notFound();

  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const { slug } = await params;

  const property = await loadPortfolioIqProperty({ userId, organizationId, slug });
  if (!property) notFound();
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, property.portfolio.marketId)) notFound();

  const trendPulses = await loadClevelandTrendPulses().catch(() => []);
  const subjectType = property.asset.assetType === "single_family" ? "house" : "apartment";
  const cityTrend = trendPulses.find((pulse) =>
    pulse.trendSource.geographyType === "city" &&
    pulse.trendSource.displayLabel.toLowerCase() === property.asset.city.toLowerCase()
  );
  const marketTrend = cityTrend ?? trendPulses.find((pulse) => pulse.trendSource.geographyType === "msa") ?? trendPulses[0];
  const preferredBedrooms = property.performance.medianBedrooms ? Math.round(property.performance.medianBedrooms) : null;
  const relevantSegment = marketTrend?.segments.find((segment) =>
    segment.label.includes(subjectType) && (preferredBedrooms === null || segment.label.startsWith(`${preferredBedrooms}-bed`))
  ) ?? marketTrend?.segments.find((segment) => segment.label.includes(subjectType));

  const { asset, performance, compSet, alerts } = property;
  const compMembers = compSet?.members ?? [];
  const hasSubjectEvidence = performance.observationCount > 0;
  const compEvidenceLocked = compSet?.status === "locked";

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <nav aria-label="Dwellsy IQ products" className="mb-7 flex flex-wrap items-center gap-2 border-b border-grid pb-4">
        <Link href="/property-managers" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-soft hover:text-navy">Operator IQ</Link>
        <Link href="/market-iq" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-soft hover:text-navy">Market IQ</Link>
        <Link href="/portfolio-iq" className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white">Portfolio IQ</Link>
        <span className="ml-auto rounded-full bg-orange-soft px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-orange-700">Internal preview</span>
      </nav>

      <p className="mb-4 text-sm text-muted-foreground">
        <Link href="/portfolio-iq" className="font-medium text-teal-700 hover:underline">← {property.portfolio.name}</Link>
      </p>

      <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_420px] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="dq-eyebrow">Property intelligence</p>
            <span className="rounded-full border border-grid bg-surface-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {asset.assetType === "single_family" ? "Single-family" : "Multifamily"}
            </span>
          </div>
          <h1 className="dq-h1">{asset.name}</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {asset.canonicalAddress}, {asset.city}, {asset.state} {asset.postalCode}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-grid bg-white px-3 py-1.5 text-navy">{asset.buildings.length} {asset.buildings.length === 1 ? "building" : "buildings"}</span>
            <span className="rounded-full border border-grid bg-white px-3 py-1.5 text-navy">Operator observed: {asset.observedOperatorName ?? "Being confirmed"}</span>
            <span className="rounded-full border border-grid bg-white px-3 py-1.5 text-navy">Comp set: {compSet?.status ?? "Not generated"}</span>
          </div>
        </div>
        <aside className="rounded-lg border border-teal/25 bg-teal-soft p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Decision read</p>
          <p className="mt-2 text-sm leading-6 text-navy">{property.decisionRead}</p>
        </aside>
      </header>

      <section aria-label="Property performance summary" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Observed asking rent" value={dollars(performance.askingRent)} detail={`${performance.observationCount} matched trailing-12-month observations`} />
        <MetricCard label="Observed rent / sf" value={decimalDollars(performance.rentPerSqFt)} detail={performance.compRentPerSqFt === null ? "Comp $/sf unavailable" : `Comp median ${decimalDollars(performance.compRentPerSqFt)}`} />
        <MetricCard label="Median listing velocity" value={performance.medianDom === null ? "Insufficient data" : `${Math.round(performance.medianDom)} days`} detail="Activation to deactivation or export cutoff" />
        <MetricCard
          label="Asking rent vs comps"
          value={compEvidenceLocked ? percent(performance.askingRentVsComps) : "Awaiting comp lock"}
          detail={compEvidenceLocked ? `Locked comp median ${dollars(performance.compAskingRent)}` : "No performance conclusion until staff review is complete"}
          tone={compEvidenceLocked ? comparisonTone(performance.askingRentVsComps) : "text-muted-foreground"}
        />
      </section>

      {property.signals.length > 0 && (
        <section aria-labelledby="property-decisions-heading" className="mt-8 rounded-xl border border-teal/25 bg-teal-soft p-5 sm:p-6">
          <p className="dq-eyebrow">Owner decision</p>
          <h2 id="property-decisions-heading" className="dq-h2">What needs attention at {asset.name}</h2>
          <div className="mt-4 space-y-3">
            {property.signals.slice(0, 3).map((signal) => (
              <article key={signal.id} className="rounded-lg border border-grid bg-white p-5">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                  <span className={signal.severity === "high" ? "text-rose-800" : "text-teal-700"}>{signal.category} · {signal.severity}</span>
                  {signal.decision && <span className="rounded-full bg-surface-soft px-2 py-1 text-navy">{portfolioDecisionLabel(signal.decision.state)}</span>}
                </div>
                <h3 className="mt-2 text-lg font-semibold text-navy">{signal.headline}</h3>
                <p className="mt-2 text-sm leading-6 text-foreground/75">{signal.narrative}</p>
                {signal.ownerQuestion && <p className="mt-3 text-sm font-medium text-navy"><strong>Question for your team:</strong> {signal.ownerQuestion}</p>}
                {signal.decision?.assignedTo && <p className="mt-2 text-xs font-semibold text-muted-foreground">Assigned to {signal.decision.assignedTo}</p>}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-grid pt-4">
                  <form action={updatePortfolioSignalDecision}><input type="hidden" name="signalId" value={signal.id} /><button name="decisionAction" value="acknowledge" className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy">Acknowledge</button></form>
                  <form action={updatePortfolioSignalDecision} className="flex gap-2"><input type="hidden" name="signalId" value={signal.id} /><input name="assignedTo" aria-label={`Assign ${signal.headline}`} defaultValue={signal.decision?.assignedTo ?? ""} placeholder="Person or team" className="w-36 rounded-md border border-grid px-3 py-2 text-xs" /><button name="decisionAction" value="assign" className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy">Assign</button></form>
                  <form action={updatePortfolioSignalDecision}><input type="hidden" name="signalId" value={signal.id} /><button name="decisionAction" value="snooze" className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy">Snooze 7 days</button></form>
                  <form action={updatePortfolioSignalDecision}><input type="hidden" name="signalId" value={signal.id} /><button name="decisionAction" value="resolve" className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Resolve</button></form>
                </div>
              </article>
            ))}
          </div>
          {property.decisionHistory.length > 0 && (
            <div className="mt-5 border-t border-teal/25 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Activity</p>
              <div className="mt-2 space-y-2">
                {property.decisionHistory.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex flex-wrap items-center gap-2 text-xs text-foreground/75">
                    <span><span className="font-semibold capitalize text-navy">{event.action}</span> · {event.decision.signal.headline}{event.assignedTo ? ` · ${event.assignedTo}` : ""}</span>
                    {["resolved", "snoozed"].includes(event.decision.state) && (
                      <form action={updatePortfolioSignalDecision}>
                        <input type="hidden" name="signalId" value={event.decision.signal.id} />
                        <button name="decisionAction" value="reopen" className="rounded-md border border-grid bg-white px-2 py-1 font-semibold text-navy">Reopen</button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {!hasSubjectEvidence && (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-amber-800">Evidence gap</p>
          <h2 className="mt-2 text-lg font-semibold text-navy">Subject performance is not inferred from neighboring properties</h2>
          <p className="mt-2 text-sm leading-6 text-foreground/75">
            The historical export did not produce a defensible address match for this property. Market and comp evidence remain visible, but subject rent, rent per square foot, and listing velocity stay blank until Dwellsy completes the property and URU match.
          </p>
        </section>
      )}

      <section aria-labelledby="comparison-heading" className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-grid bg-white p-5 sm:p-6">
          <p className="dq-eyebrow">Portfolio IQ comparison</p>
          <h2 id="comparison-heading" className="dq-h2">Subject versus proposed comps</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <article className="rounded-lg border border-grid bg-surface-soft p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subject property</p>
              <p className="mt-3 text-2xl font-semibold text-navy">{dollars(performance.askingRent)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Median observed asking rent</p>
              <dl className="mt-4 space-y-2 border-t border-grid pt-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Rent / sf</dt><dd className="font-medium text-navy">{decimalDollars(performance.rentPerSqFt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Recent listings</dt><dd className="font-medium text-navy">{performance.recentListingCount}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">90-day rent move</dt><dd className={`font-medium ${comparisonTone(performance.askingRentChange90d)}`}>{percent(performance.askingRentChange90d)}</dd></div>
              </dl>
            </article>
            <article className="rounded-lg border border-grid bg-surface-soft p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{compEvidenceLocked ? "Locked comp set" : "Proposed comp set"}</p>
              <p className="mt-3 text-2xl font-semibold text-navy">{dollars(performance.compAskingRent)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Median latest asking rent</p>
              <dl className="mt-4 space-y-2 border-t border-grid pt-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Rent / sf</dt><dd className="font-medium text-navy">{decimalDollars(performance.compRentPerSqFt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Properties</dt><dd className="font-medium text-navy">{compMembers.length}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Status</dt><dd className="font-medium capitalize text-navy">{compSet?.status ?? "Unavailable"}</dd></div>
              </dl>
            </article>
          </div>
        </div>
        <aside className="rounded-lg border border-grid bg-surface-soft p-5 sm:p-6">
          <p className="dq-eyebrow">Market IQ context</p>
          <h2 className="dq-h2">{marketTrend?.trendSource.displayLabel ?? "Cleveland MSA"}</h2>
          {relevantSegment ? (
            <div className="mt-5 rounded-lg border border-grid bg-white p-5">
              <p className="text-sm font-semibold text-navy">{relevantSegment.label}</p>
              <p className="mt-2 text-2xl font-semibold text-navy">${relevantSegment.rent.toLocaleString("en-US")}</p>
              <p className={`mt-1 text-sm font-semibold ${relevantSegment.yoy >= 0 ? "text-teal-700" : "text-rose-700"}`}>{percent(relevantSegment.yoy)} year over year</p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Based on {relevantSegment.observations.toLocaleString("en-US")} authoritative Dwellsy IQ trend observations.</p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">A matching product segment is not yet reportable for this geography.</p>
          )}
          <Link href="/market-iq" className="mt-5 inline-flex text-sm font-semibold text-teal-700 hover:underline">Explore the full market →</Link>
        </aside>
      </section>

      <section aria-labelledby="comps-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="dq-eyebrow">Comparable evidence</p>
            <h2 id="comps-heading" className="dq-h2">{compEvidenceLocked ? "Approved comparable set" : "Dwellsy-proposed comp set"}</h2>
          </div>
          <p className="text-xs text-muted-foreground">Generated {dateLabel(compSet?.generatedAt)} · {compSet?.status ?? "Unavailable"}</p>
        </div>
        {compMembers.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-lg border border-grid bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-surface-soft text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-bold">Comparable</th>
                    <th className="px-5 py-3 font-bold">Selection</th>
                    <th className="px-5 py-3 text-right font-bold">Beds</th>
                    <th className="px-5 py-3 text-right font-bold">Asking rent</th>
                    <th className="px-5 py-3 text-right font-bold">Square feet</th>
                    <th className="px-5 py-3 text-right font-bold">Rent / sf</th>
                    <th className="px-5 py-3 text-right font-bold">Activated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-grid">
                  {compMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-surface-soft/50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-navy">{member.propertyLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{member.address}{member.city ? `, ${member.city}` : ""}</p>
                      </td>
                      <td className="px-5 py-4 text-foreground/75">{member.selectionReason}</td>
                      <td className="px-5 py-4 text-right tabular-nums">{member.bedrooms ?? "—"}</td>
                      <td className="px-5 py-4 text-right font-medium tabular-nums text-navy">{dollars(member.askingRent)}</td>
                      <td className="px-5 py-4 text-right tabular-nums">{member.squareFeet ? Math.round(member.squareFeet).toLocaleString("en-US") : "—"}</td>
                      <td className="px-5 py-4 text-right tabular-nums">{member.askingRent && member.squareFeet ? decimalDollars(member.askingRent / member.squareFeet) : "—"}</td>
                      <td className="px-5 py-4 text-right text-xs text-muted-foreground">{dateLabel(member.activatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-grid bg-surface-soft px-5 py-3 text-xs leading-5 text-muted-foreground">{compSet?.methodology}</p>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-grid bg-surface-soft p-6 text-sm text-muted-foreground">
            A proposed comp set has not been generated yet. This does not block market monitoring.
          </div>
        )}
      </section>

      <section aria-labelledby="alerts-heading" className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="dq-eyebrow">Relevant change signals</p>
          <h2 id="alerts-heading" className="dq-h2">Alerts around this property</h2>
          {alerts.length > 0 ? (
            <div className="mt-5 space-y-3">
              {alerts.map((alert) => (
                <article key={alert.id} className="rounded-lg border border-grid bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">{alert.geographyType} · {alert.geographyValue}</p>
                      <h3 className="mt-1 font-semibold text-navy">{alert.headline}</h3>
                    </div>
                    <span className="rounded-full bg-orange-soft px-2.5 py-1 text-[10px] font-bold uppercase text-orange-700">{alert.severity}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.narrative}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-grid bg-surface-soft p-5 text-sm text-muted-foreground">No material geography and product alerts are currently persisted for this property.</p>
          )}
        </div>
        <aside className="rounded-lg border border-grid bg-surface-soft p-5 sm:p-6 lg:self-start">
          <p className="dq-eyebrow">Operator IQ context</p>
          <h2 className="dq-h2">{asset.observedOperatorName ?? "Operator being confirmed"}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The assignment is observed from Dwellsy listing activity and is not presented as a verified management contract. Detailed performance comparisons, activity history, and scorecards remain in Operator IQ.
          </p>
          <Link href="/property-managers" className="mt-5 inline-flex rounded-md border border-navy bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-surface-soft">Open Operator IQ</Link>
        </aside>
      </section>

      <section className="mt-10 rounded-lg border border-grid bg-surface-soft p-5 sm:p-6">
        <p className="dq-eyebrow">Sources and limits</p>
        <h2 className="dq-h2">High-frequency asking-market intelligence</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
          Subject and comp observations come from {property.dataImport?.sourceName ?? "the Cleveland historical listing export"}, available through {dateLabel(property.availableThrough)}. Market direction and alerts come from the separate Dwellsy IQ trends source. These measures describe advertised asking activity, not occupancy, signed leases, concessions, or effective rent.
        </p>
      </section>
    </main>
  );
}
