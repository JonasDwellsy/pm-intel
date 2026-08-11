import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { PortfolioWatchDigestPanel } from "@/components/portfolio-iq/PortfolioWatchDigestPanel";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { portfolioDecisionLabel } from "@/lib/portfolio-iq/decision";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadOwnerToday } from "@/lib/portfolio-iq/today.server";
import { parseTodaySignalEvidence } from "@/lib/portfolio-iq/today";
import { updatePortfolioDigestPreference, updatePortfolioSignalDecision } from "@/app/portfolio-iq/actions";

export const dynamic = "force-dynamic";

function dollars(value: number | null): string {
  return value === null ? "Not enough evidence" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function percent(value: number | null): string {
  if (value === null) return "Not enough evidence";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function days(value: number | null): string {
  return value === null ? "Not enough evidence" : `${Math.round(value)} days`;
}

function severityStyle(severity: string): string {
  if (severity === "high") return "border-rose-200 bg-rose-50/45";
  if (severity === "medium") return "border-amber-200 bg-amber-50/35";
  return "border-grid bg-white";
}

function sourceDate(value: Date | string | null | undefined): string {
  if (!value) return "Source refresh pending";
  const date = typeof value === "string" ? new Date(value) : value;
  return `Through ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

function evidenceSourceCount(value: string): number {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default async function TodayPage() {
  if (!portfolioIqPreviewEnabled()) notFound();
  if (!(await viewerHasProductAccess("portfolio_iq"))) notFound();

  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");

  const today = await loadOwnerToday({ userId, organizationId });
  if (!today) notFound();
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, today.portfolio.marketId)) notFound();

  const highPriorityCount = today.todaySignals.filter((signal) => signal.severity === "high").length;
  const affectedAssets = new Set(today.todaySignals.map((signal) => signal.assetId)).size;
  const assignedCount = today.todaySignals.filter((signal) => Boolean(signal.decision?.assignedTo)).length;
  const newCount = today.todaySignals.filter((signal) => !today.digestPreference?.lastSignalAt || signal.firstSeenAt > today.digestPreference.lastSignalAt).length;
  const readyAssets = today.portfolio.assets.filter((asset) => ["ready", "monitoring"].includes(asset.readinessStatus)).length;

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />

      <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_390px] lg:items-end">
        <div>
          <p className="dq-eyebrow">Owner attention queue</p>
          <h1 className="dq-h1">Today</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">
            The most important changes across {today.portfolio.name}, ranked by decision value. Open any issue to see the market, asset, comp, and operator evidence in one place.
          </p>
        </div>
        <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">This morning</p>
          <p className="mt-2 text-xl font-semibold leading-7 text-navy">
            {highPriorityCount > 0 ? `${highPriorityCount} high-priority ${highPriorityCount === 1 ? "issue" : "issues"}` : "No high-priority changes"}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/75">
            {affectedAssets} assets are represented in today&apos;s queue. {assignedCount ? `${assignedCount} already ${assignedCount === 1 ? "has" : "have"} an owner.` : "Nothing has been assigned yet."}
          </p>
        </aside>
      </header>

      <section aria-label="Today summary" className="mt-7 overflow-hidden rounded-xl border border-grid bg-white shadow-sm">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Needs attention", String(highPriorityCount), "High-priority evidence"],
            ["New since briefing", String(newCount), "Changes not in the prior digest"],
            ["Assets exposed", String(affectedAssets), `of ${today.portfolio.assets.length} in the portfolio`],
            ["Monitoring now", `${readyAssets}/${today.portfolio.assets.length}`, "Remaining assets are activating"],
          ].map(([label, value, detail]) => (
            <article key={label} className="border-b border-grid px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-[28px] font-semibold tracking-tight text-navy">{value}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="today-issues-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dq-eyebrow">Detect, diagnose, decide</p>
            <h2 id="today-issues-heading" className="dq-h2">What deserves attention</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Each issue begins with a material change, identifies the exposed asset, and keeps unsupported conclusions visibly out of the diagnosis.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Showing the top {today.todaySignals.length} owner-relevant issues</p>
        </div>

        <div className="mt-5 space-y-4">
          {today.todaySignals.map((signal, index) => {
            const property = signal.asset?.slug ? today.properties.get(signal.asset.slug) : null;
            const evidence = parseTodaySignalEvidence(signal.evidence);
            const segment = property?.segments.find((candidate) => candidate.bedrooms === evidence.bedrooms) ?? null;
            const performance = segment?.performance ?? property?.performance ?? null;
            const cityTrend = property
              ? today.trendPulses.find((pulse) => pulse.trendSource.geographyType === "city" && pulse.trendSource.displayLabel.toLowerCase() === property.asset.city.toLowerCase())
              : null;
            const marketTrend = cityTrend ?? today.trendPulses.find((pulse) => pulse.trendSource.geographyType === "msa") ?? today.trendPulses[0] ?? null;
            const productType = property?.asset.assetType === "single_family" ? "house" : "apartment";
            const marketSegment = marketTrend?.segments.find((candidate) =>
              candidate.label.includes(productType) && (evidence.bedrooms === null || candidate.label.startsWith(`${evidence.bedrooms}-bed`))
            ) ?? null;
            const isNew = !today.digestPreference?.lastSignalAt || signal.firstSeenAt > today.digestPreference.lastSignalAt;
            const compCount = segment?.compPropertyCount ?? property?.compSet?.members.length ?? 0;
            const compStatus = segment ? segment.evidenceStatus : property?.compSet?.status ?? "not started";
            const connectedSourceCount = evidenceSourceCount(signal.evidenceSources);
            const operatorResponse = signal.assetId ? today.operatorResponses.get(signal.assetId) ?? null : null;

            return (
              <article key={signal.id} className={`overflow-hidden rounded-xl border ${severityStyle(signal.severity)}`}>
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[52px_1fr_auto] lg:items-start">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{index + 1}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em]">
                      <span className={signal.severity === "high" ? "text-rose-800" : "text-teal-700"}>{signal.category}</span>
                      <span className="text-muted-foreground">{signal.confidence === "setup" ? "Setup signal" : `${signal.confidence} confidence`}</span>
                      {isNew && <span className="rounded-full bg-navy px-2 py-0.5 text-white">New</span>}
                      {signal.unifiedInsightId && <span className="rounded-full border border-teal/25 bg-teal-soft px-2 py-0.5 text-teal-800">Connected insight</span>}
                      {signal.decision && <span className="rounded-full border border-grid bg-white px-2 py-0.5 text-navy">{portfolioDecisionLabel(signal.decision.state)}</span>}
                    </div>
                    <h3 className="mt-2 text-xl font-semibold leading-7 text-navy">{signal.headline}</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/75">{signal.narrative}</p>
                    {signal.ownerQuestion && (
                      <p className="mt-4 rounded-lg border border-grid bg-white/80 px-4 py-3 text-sm font-medium leading-6 text-navy">
                        <span className="font-bold">Decision to consider:</span> {signal.ownerQuestion}
                      </p>
                    )}
                  </div>
                  {signal.asset && (
                    <div className="flex flex-col gap-2">
                      <Link href={`/today/cases/${signal.id}`} className="rounded-md bg-navy px-3 py-2 text-center text-xs font-semibold text-white hover:bg-navy-700">Decision case</Link>
                      <Link href={`/portfolio-iq/properties/${signal.asset.slug}`} className="rounded-md border border-navy bg-white px-3 py-2 text-center text-xs font-semibold text-navy hover:bg-surface-soft">Open property</Link>
                    </div>
                  )}
                </div>

                <details className="group border-t border-grid bg-white/85">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-navy sm:px-6">
                    <span>Open the full diagnosis{connectedSourceCount ? ` · ${connectedSourceCount} evidence sources` : ""}</span>
                    <span className="text-lg text-teal-700 transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <div className="grid gap-px border-t border-grid bg-grid lg:grid-cols-4">
                    <section className="bg-white p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Market context</p>
                      <h4 className="mt-2 font-semibold text-navy">{marketSegment?.label ?? "Relevant local segment"}</h4>
                      {marketSegment ? (
                        <p className="mt-2 text-sm leading-6 text-foreground/75">
                          Asking rent is {dollars(marketSegment.rent)}, {percent(marketSegment.yoy)} year over year, based on {marketSegment.observations.toLocaleString("en-US")} observations.
                        </p>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">No market measure is substituted when the matching product segment is unavailable.</p>
                      )}
                      <p className="mt-3 text-[11px] text-muted-foreground">{sourceDate(marketTrend?.trendSource.availableThrough)}</p>
                      <Link href="/market-iq" className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:underline">Explore market evidence →</Link>
                    </section>

                    <section className="bg-white p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Asset exposure</p>
                      <h4 className="mt-2 font-semibold text-navy">{property?.asset.name ?? "Property being resolved"}</h4>
                      {performance ? (
                        <dl className="mt-3 space-y-2 text-sm">
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Observed rent</dt><dd className="font-semibold text-navy">{dollars(performance.askingRent)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">90-day move</dt><dd className="font-semibold text-navy">{percent(performance.askingRentChange90d)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Listing velocity</dt><dd className="font-semibold text-navy">{days(performance.medianDom)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Observations</dt><dd className="font-semibold text-navy">{performance.observationCount}</dd></div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">Dwellsy is completing the property match before enabling asset conclusions.</p>
                      )}
                    </section>

                    <section className="bg-white p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Comp evidence</p>
                      <h4 className="mt-2 font-semibold capitalize text-navy">{String(compStatus).replaceAll("_", " ")}</h4>
                      {segment?.isLocked ? (
                        <dl className="mt-3 space-y-2 text-sm">
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Approved comps</dt><dd className="font-semibold text-navy">{compCount}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Comp rent</dt><dd className="font-semibold text-navy">{dollars(segment.performance.compAskingRent)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Position</dt><dd className="font-semibold text-navy">{percent(segment.performance.askingRentVsComps)}</dd></div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {compCount ? `${compCount} proposed or approved properties are being reviewed.` : "No comp conclusion is shown until the relevant segment is reviewed and locked."}
                        </p>
                      )}
                      {signal.asset && <Link href={`/portfolio-iq/properties/${signal.asset.slug}#comps-heading`} className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:underline">Review comparable evidence →</Link>}
                    </section>

                    <section className="bg-white p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Operator response</p>
                      <h4 className="mt-2 font-semibold text-navy">{property?.asset.observedOperatorName ?? "Operator being confirmed"}</h4>
                      {operatorResponse?.status === "matched" ? (
                        <>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Operator IQ benchmark</p>
                          <dl className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Market rank</dt><dd className="font-semibold text-navy">#{operatorResponse.overallRank ?? "–"} of {operatorResponse.overallRankTotal ?? "–"}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Lease-up speed</dt><dd className="font-semibold text-navy">{days(operatorResponse.leaseUpDom)}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cohort recognition</dt><dd className="font-semibold text-navy">{operatorResponse.goldCount} gold · {operatorResponse.silverCount} silver</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Observed listings · T12</dt><dd className="font-semibold text-navy">{operatorResponse.t12Listings?.toLocaleString("en-US") ?? "–"}</dd></div>
                          </dl>
                          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                            Observed assignment, not a verified management contract. Benchmark through {operatorResponse.dataAsOf ? new Date(operatorResponse.dataAsOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "the latest Operator IQ cutoff"}. Live response tracking remains paused until the listing feed is available.
                          </p>
                          <Link href={operatorResponse.scorecardHref ?? "/property-managers"} className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:underline">Open full Operator IQ scorecard →</Link>
                        </>
                      ) : (
                        <>
                          <p className="mt-2 text-sm leading-6 text-foreground/75">
                            {property?.asset.observedOperatorName
                              ? operatorResponse?.status === "ambiguous"
                                ? "More than one Operator IQ identity matches this observed name. Dwellsy is holding the connection for review instead of choosing one."
                                : "This observed assignment has not been matched exactly to an Operator IQ identity. No operator benchmark is substituted."
                              : "Dwellsy is resolving the observed operator before adding execution context."}
                          </p>
                          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Live pricing and listing-response tracking remains paused until the listing feed is available.</p>
                          <Link href="/property-managers" className="mt-3 inline-flex text-xs font-semibold text-teal-700 hover:underline">Search Operator IQ →</Link>
                        </>
                      )}
                    </section>
                  </div>
                </details>

                <div className="flex flex-wrap items-center gap-2 border-t border-grid bg-white px-5 py-4 sm:px-6">
                  <form action={updatePortfolioSignalDecision}>
                    <input type="hidden" name="signalId" value={signal.id} />
                    <button name="decisionAction" value="acknowledge" className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy hover:bg-surface-soft">Acknowledge</button>
                  </form>
                  <form action={updatePortfolioSignalDecision} className="flex gap-2">
                    <input type="hidden" name="signalId" value={signal.id} />
                    <input name="assignedTo" aria-label={`Assign ${signal.headline}`} defaultValue={signal.decision?.assignedTo ?? ""} placeholder="Person or team" className="w-36 rounded-md border border-grid px-3 py-2 text-xs text-navy" />
                    <button name="decisionAction" value="assign" className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy hover:bg-surface-soft">Assign</button>
                  </form>
                  <form action={updatePortfolioSignalDecision}>
                    <input type="hidden" name="signalId" value={signal.id} />
                    <button name="decisionAction" value="snooze" className="rounded-md border border-grid px-3 py-2 text-xs font-semibold text-navy hover:bg-surface-soft">Snooze 7 days</button>
                  </form>
                  <form action={updatePortfolioSignalDecision}>
                    <input type="hidden" name="signalId" value={signal.id} />
                    <button name="decisionAction" value="resolve" className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white hover:bg-navy-700">Resolve</button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-grid bg-white p-5 sm:p-6">
          <p className="dq-eyebrow">Monitor</p>
          <h2 className="dq-h2">What changed after the decision</h2>
          {today.decisionHistory.length ? (
            <div className="mt-4 divide-y divide-grid">
              {today.decisionHistory.slice(0, 5).map((event) => (
                <div key={event.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
                  <span className="font-semibold capitalize text-navy">{event.action}</span>
                  <span className="text-foreground/75">{event.decision.signal.headline}</span>
                  {event.assignedTo && <span className="rounded-full bg-surface-soft px-2 py-1 text-xs text-muted-foreground">{event.assignedTo}</span>}
                  <time className="ml-auto text-xs text-muted-foreground">{event.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</time>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Decision history will appear as your team acknowledges, assigns, and resolves issues.</p>
          )}
          <p className="mt-4 border-t border-grid pt-4 text-xs leading-5 text-muted-foreground">
            Outcome measurement will compare future asking-market and operator-response observations with the evidence captured when the decision was made.
          </p>
        </div>

        <aside id="briefing" className="scroll-mt-24 rounded-xl border border-teal/25 bg-teal-soft p-5 sm:p-6">
          <p className="dq-eyebrow">Weekly briefing</p>
          <h2 className="dq-h2">The same decisions, delivered concisely</h2>
          <p className="mt-2 text-sm leading-6 text-foreground/75">The briefing uses this exact ranked queue and sends only when a new signal appears and the weekly cadence is due.</p>
          <form action={updatePortfolioDigestPreference} className="mt-5 flex flex-wrap items-center gap-3">
            <input type="hidden" name="portfolioId" value={today.portfolio.id} />
            <label className="flex items-center gap-2 text-sm font-medium text-navy">
              <input type="checkbox" name="enabled" defaultChecked={today.digestPreference?.enabled ?? false} />
              Email me the weekly owner briefing
            </label>
            <button className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Save preference</button>
          </form>
          <div className="mt-4"><PortfolioWatchDigestPanel /></div>
        </aside>
      </section>

      <section className="mt-10 rounded-xl border border-grid bg-surface-soft p-5 sm:p-6">
        <p className="dq-eyebrow">Evidence boundary</p>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
          Dwellsy IQ Online reports observed asking-market activity, authoritative Dwellsy IQ trends, reviewed comparable evidence, owner-supplied portfolio context, and observed operator listing activity. It does not represent occupancy, signed leases, concessions, effective rent, or verified management contracts.
        </p>
      </section>
    </main>
  );
}
