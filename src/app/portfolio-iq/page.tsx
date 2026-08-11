import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { loadClevelandHistoricalPulse } from "@/lib/market-iq/historical.server";
import { loadClevelandTrendPulses } from "@/lib/market-iq/trends.server";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadPortfolioIqHome } from "@/lib/portfolio-iq/home.server";
import type { HistoricalListingPulse, MarketIqPlacePulse } from "@/lib/market-iq/historical";
import type { MarketIqTrendPulse } from "@/lib/market-iq/trends";
import { loadPortfolioDecisionHistory } from "@/lib/portfolio-iq/watch.server";
import { updatePortfolioDigestPreference, updatePortfolioSignalDecision } from "./actions";
import { PortfolioWatchDigestPanel } from "@/components/portfolio-iq/PortfolioWatchDigestPanel";
import { portfolioDecisionLabel } from "@/lib/portfolio-iq/decision";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { loadOwnerToday } from "@/lib/portfolio-iq/today.server";

export const dynamic = "force-dynamic";

function formatChange(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function readinessLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: "Ready",
    monitoring: "Monitoring",
    operator_outreach: "Operator outreach",
    dwellsy_onboarding: "Dwellsy onboarding",
    needs_confirmation: "Needs confirmation",
  };
  return labels[status] ?? "In activation";
}

function readinessClass(status: string): string {
  if (status === "ready" || status === "monitoring") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "operator_outreach") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function compLabel(status: string): string {
  if (status === "ready") return "Monitoring comps";
  if (status === "review") return "Comp set in review";
  return "Pending confirmation";
}

function cityKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function localMarketText(place: MarketIqPlacePulse | undefined): string {
  if (!place) return "Cleveland market context";
  return `${formatChange(place.change)} new listings · $${place.rentPerSqFt.toFixed(2)}/sf`;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="border-b border-grid px-5 py-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-[28px] font-semibold tracking-tight text-navy">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}

export default async function PortfolioIqPage() {
  if (!portfolioIqPreviewEnabled()) notFound();

  const hasProduct = await viewerHasProductAccess("portfolio_iq");
  if (!hasProduct) notFound();

  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");

  const portfolio = await loadPortfolioIqHome({ userId, organizationId });
  if (!portfolio) notFound();

  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, portfolio.marketId)) notFound();

  const [historicalPulse, trendPulses, ownerToday, decisionHistory] = await Promise.all([
    loadClevelandHistoricalPulse().catch(() => null as HistoricalListingPulse | null),
    loadClevelandTrendPulses().catch(() => [] as MarketIqTrendPulse[]),
    loadOwnerToday({ userId, organizationId, portfolioId: portfolio.id }),
    loadPortfolioDecisionHistory(portfolio.id),
  ]);
  const portfolioSignals = ownerToday?.todaySignals ?? [];
  const digestPreference = ownerToday?.digestPreference ?? null;
  const developingFindingCount = ownerToday?.attentionQueue.watchlist.length ?? 0;

  const assets = portfolio.assets;
  const buildingCount = assets.reduce((sum, asset) => sum + asset.buildings.length, 0);
  const monitoredCount = assets.filter((asset) => ["ready", "monitoring"].includes(asset.readinessStatus)).length;
  const matchedCount = assets.filter((asset) => asset.matchStatus === "matched").length;
  const uruCoveredCount = assets.filter((asset) => ["observed", "partial"].includes(asset.uruStatus)).length;
  const lockedCompCount = assets.filter((asset) => asset.compSet?.status === "locked").length;
  const activationTasks = assets.flatMap((asset) => asset.activationTasks);
  const openActivationTasks = activationTasks.filter((task) => task.status !== "complete");
  const launchReady = assets.length > 0 && assets.every((asset) => ["ready", "monitoring"].includes(asset.readinessStatus));
  const onboardingTotal = 2 + assets.length * 3;
  const onboardingComplete = 1 + matchedCount + uruCoveredCount + lockedCompCount + (launchReady ? 1 : 0);
  const onboardingProgress = Math.round((onboardingComplete / onboardingTotal) * 100);
  const operators = [...new Set(assets.flatMap((asset) => asset.observedOperatorName ? [asset.observedOperatorName] : []))];
  const multifamilyCount = assets.filter((asset) => asset.assetType === "multifamily").length;
  const sfrCount = assets.length - multifamilyCount;
  const needsConfirmation = assets.filter((asset) => asset.matchStatus !== "matched");
  const cityPulseByName = new Map(
    (historicalPulse?.places ?? []).map((place) => [cityKey(place.name), place])
  );
  const msaTrend = trendPulses.find((pulse) => pulse.trendSource.geographyType === "msa") ?? trendPulses[0] ?? null;
  const topSegments = msaTrend?.segments.slice(0, 4) ?? [];
  const rentDirection = historicalPulse
    ? `${formatChange(historicalPulse.historical.newListingsChange)} new listings versus the prior 30 days`
    : "Market listing refresh in progress";
  const onboardingMilestones = [
    { label: "Portfolio received", complete: true, detail: `${assets.length} properties loaded` },
    { label: "Property identity", complete: matchedCount === assets.length, detail: `${matchedCount} of ${assets.length} confirmed` },
    { label: "Dwellsy listing coverage", complete: uruCoveredCount === assets.length, detail: `${uruCoveredCount} of ${assets.length} covered` },
    { label: "Comparable review", complete: lockedCompCount === assets.length, detail: `${lockedCompCount} of ${assets.length} locked` },
    { label: "Launch review", complete: launchReady, detail: launchReady ? "Ready to schedule" : "Follows data review" },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
      <DwellsyIqWorkspaceNav />

      <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_390px] lg:items-end">
        <div>
          <p className="dq-eyebrow">Owner workspace</p>
          <h1 className="dq-h1">{portfolio.name}</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">
            One view of the properties you own, the markets around them, and the operators running them. Portfolio IQ uses observed asking-market activity and does not represent occupancy, signed leases, or effective rent.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/today" className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">Open Today</Link>
            <Link href="/portfolio-iq/launch-briefing" className="rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy hover:bg-surface-soft">Launch briefing</Link>
            <Link href="/portfolio-iq/financial-impact" className="rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy hover:bg-surface-soft">Financial impact</Link>
            <Link href="/onboarding" className="rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy hover:bg-surface-soft">Onboarding center</Link>
            <a href="#properties" className="rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy hover:bg-surface-soft">Review properties</a>
            <Link href="/market-iq" className="rounded-md border border-navy px-4 py-2.5 text-sm font-semibold text-navy hover:bg-surface-soft">Open Market IQ</Link>
          </div>
        </div>
        <aside className="rounded-lg border border-teal/25 bg-teal-soft p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Decision read</p>
          <p className="mt-2 text-lg font-semibold leading-7 text-navy">
            {msaTrend?.signal.heading ?? "Portfolio activation is underway"}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/75">
            {msaTrend?.signal.narrative ?? `${matchedCount} of ${assets.length} property matches are confirmed and ready for portfolio monitoring.`}
          </p>
        </aside>
      </header>

      <section aria-labelledby="onboarding-heading" className="mt-8 overflow-hidden rounded-xl border border-teal/25 bg-teal-soft">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <p className="dq-eyebrow">Assisted onboarding</p>
            <h2 id="onboarding-heading" className="dq-h2">Dwellsy is preparing your portfolio</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/75">
              Your onboarding specialist is resolving property identity, Dwellsy listing coverage, operator relationships, and comparable sets. You do not need to clean the data yourself. We will contact you only when an ownership or operating detail needs confirmation.
            </p>
            <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/80">
              <div className="h-full rounded-full bg-teal-700" style={{ width: `${onboardingProgress}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-4 text-xs text-foreground/70">
              <span>{onboardingProgress}% prepared</span>
              <span>{openActivationTasks.length} internal tasks remaining</span>
            </div>
          </div>
          <div className="rounded-lg border border-grid bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Setup milestones</p>
            <ol className="mt-3 space-y-2.5 text-sm">
              {onboardingMilestones.map(({ label, complete, detail }) => (
                <li key={label} className="flex items-center gap-3">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${complete ? "bg-emerald-600 text-white" : "border border-grid bg-surface-soft text-grey-500"}`}>
                    {complete ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 font-medium text-navy">{label}</span>
                  <span className="text-xs text-muted-foreground">{detail}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="portfolio-watch" aria-labelledby="portfolio-watch-heading" className="mt-10 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dq-eyebrow">Portfolio Watch</p>
            <h2 id="portfolio-watch-heading" className="dq-h2">What needs a decision</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">A compact portfolio view of the same three decisions ranked on Today. Evidence quality, exposure, financial materiality, and urgency determine what appears here.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-800">{portfolioSignals.length} decision ready</span>
            <span className="rounded-full border border-grid bg-surface-soft px-3 py-1 font-semibold text-navy">{developingFindingCount} on watchlist</span>
          </div>
        </div>
        {portfolioSignals.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {portfolioSignals.map((signal) => {
              const severityClass = signal.severity === "high" ? "border-rose-200 bg-rose-50/40" : signal.severity === "medium" ? "border-amber-200 bg-amber-50/35" : "border-grid bg-white";
              return (
                <article key={signal.id} className={`rounded-xl border p-5 ${severityClass}`}>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em]">
                    <span className={signal.severity === "high" ? "text-rose-800" : "text-teal-700"}>{signal.category}</span>
                    <span className="text-muted-foreground">{signal.findingQuality.calibratedConfidence} confidence</span>
                    <span className="rounded-full border border-grid bg-white px-2 py-0.5 text-navy">Quality {signal.findingQuality.score}/100</span>
                    {signal.decision && <span className="rounded-full border border-grid bg-white px-2 py-0.5 text-navy">{portfolioDecisionLabel(signal.decision.state)}</span>}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold leading-6 text-navy">{signal.headline}</h3>
                  <p className="mt-2 text-sm leading-6 text-foreground/75">{signal.narrative}</p>
                  <p className="mt-3 text-xs font-semibold leading-5 text-teal-800">{signal.findingQuality.reason}</p>
                  {signal.ownerQuestion && <p className="mt-3 border-t border-grid pt-3 text-sm font-medium leading-6 text-navy"><span className="font-bold">Question for your team:</span> {signal.ownerQuestion}</p>}
                  {signal.decision?.assignedTo && <p className="mt-3 text-xs font-semibold text-muted-foreground">Assigned to {signal.decision.assignedTo}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-grid pt-4">
                    <Link href={`/today/cases/${signal.id}`} className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Open decision case</Link>
                    {signal.asset && <Link href={`/portfolio-iq/properties/${signal.asset.slug}`} className="inline-flex text-sm font-semibold text-teal-700 hover:underline">Open {signal.asset.name} →</Link>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-grid px-6 py-10 text-center text-sm text-muted-foreground">Portfolio Watch is awaiting its first evidence refresh.</div>
        )}
      </section>

      {decisionHistory.length > 0 && (
        <section aria-labelledby="decision-history-heading" className="mt-8 rounded-xl border border-grid bg-white p-5 sm:p-6">
          <p className="dq-eyebrow">Decision history</p>
          <h2 id="decision-history-heading" className="dq-h2">What your team has done</h2>
          <div className="mt-4 divide-y divide-grid">
            {decisionHistory.slice(0, 8).map((event) => (
              <div key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                <span className="font-semibold capitalize text-navy">{event.action}</span>
                <span className="text-foreground/75">{event.decision.signal.headline}</span>
                {event.assignedTo && <span className="rounded-full bg-surface-soft px-2 py-1 text-xs text-muted-foreground">{event.assignedTo}</span>}
                {["resolved", "snoozed"].includes(event.decision.state) && (
                  <form action={updatePortfolioSignalDecision}>
                    <input type="hidden" name="signalId" value={event.decision.signal.id} />
                    <button name="decisionAction" value="reopen" className="rounded-md border border-grid bg-white px-2 py-1 text-xs font-semibold text-navy">Reopen</button>
                  </form>
                )}
                <time className="ml-auto text-xs text-muted-foreground">{event.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Portfolio summary" className="mt-8 overflow-hidden rounded-lg border border-grid bg-white shadow-sm">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Portfolio assets" value={String(assets.length)} detail={`${multifamilyCount} multifamily · ${sfrCount} SFR`} />
          <MetricCard label="Physical buildings" value={String(buildingCount)} detail="Communities and individual homes" />
          <MetricCard label="Monitoring now" value={`${monitoredCount}/${assets.length}`} detail={`${assets.length - monitoredCount} completing activation`} />
          <MetricCard label="Observed operators" value={String(operators.length)} detail="Across the current portfolio" />
          <MetricCard label="Cleveland supply" value={historicalPulse ? formatChange(historicalPulse.historical.newListingsChange) : "Refreshing"} detail="New listings, latest 30-day export window" />
        </div>
      </section>

      <section aria-labelledby="attention-heading" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="dq-eyebrow">Portfolio brief</p>
            <h2 id="attention-heading" className="dq-h2">What deserves attention now</h2>
          </div>
          <p className="text-xs text-muted-foreground">{rentDirection}</p>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <article className="rounded-lg border border-grid bg-white p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Market</p>
            <h3 className="mt-2 text-lg font-semibold text-navy">{msaTrend?.signal.heading ?? "Cleveland trend refresh in progress"}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {msaTrend?.signal.narrative ?? "No trend values are substituted while the authoritative Dwellsy IQ snapshot refreshes."}
            </p>
            <Link href="/market-iq" className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline">See the market evidence →</Link>
          </article>
          <article className="rounded-lg border border-grid bg-white p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Portfolio</p>
            <h3 className="mt-2 text-lg font-semibold text-navy">{matchedCount} of {assets.length} property matches confirmed</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {needsConfirmation.length > 0
                ? `${needsConfirmation.slice(0, 3).map((asset) => asset.name).join(", ")}${needsConfirmation.length > 3 ? ` and ${needsConfirmation.length - 3} more` : ""} are being confirmed before their comp monitoring is locked.`
                : "Every property is matched and ready for continuous comparison."}
            </p>
            <a href="#properties" className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline">Review portfolio readiness →</a>
          </article>
          <article className="rounded-lg border border-grid bg-white p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Operators</p>
            <h3 className="mt-2 text-lg font-semibold text-navy">{operators.length} operators observed across the portfolio</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Operator assignments come from observed listing activity. Portfolio IQ supplies the owner context; Operator IQ provides detailed benchmarks and scorecards.
            </p>
            <Link href="/property-managers" className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline">Open Operator IQ →</Link>
          </article>
        </div>
      </section>

      <section aria-labelledby="market-heading" className="mt-10 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-grid bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="dq-eyebrow">Market IQ lens</p>
              <h2 id="market-heading" className="dq-h2">Cleveland asking-rent context</h2>
            </div>
            {msaTrend && <p className="text-xs text-muted-foreground">Through {msaTrend.trendSource.availableThrough}</p>}
          </div>
          {topSegments.length > 0 ? (
            <div className="mt-5 divide-y divide-grid">
              {topSegments.map((segment) => (
                <div key={segment.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="font-medium text-navy">{segment.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{segment.observations.toLocaleString("en-US")} observations</p>
                  </div>
                  <p className="font-semibold tabular-nums text-navy">${segment.rent.toLocaleString("en-US")}</p>
                  <span className={`min-w-[70px] rounded-full px-2.5 py-1 text-center text-xs font-semibold tabular-nums ${segment.yoy >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                    {formatChange(segment.yoy)} YoY
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Authoritative segment trends are refreshing.</p>
          )}
        </div>
        <aside className="rounded-lg border border-grid bg-surface-soft p-5 sm:p-6">
          <p className="dq-eyebrow">Operator IQ lens</p>
          <h2 className="dq-h2">Who is running the portfolio</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {operators.map((operator) => (
              <span key={operator} className="rounded-full border border-grid bg-white px-3 py-1.5 text-xs font-medium text-navy">{operator}</span>
            ))}
          </div>
          <p className="mt-5 border-t border-grid pt-4 text-xs leading-5 text-muted-foreground">
            This is intentionally a contextual view. Detailed performance comparisons, activity history, and operator scorecards remain in Operator IQ.
          </p>
        </aside>
      </section>

      <section id="properties" aria-labelledby="properties-heading" className="mt-10 scroll-mt-24">
        <div>
          <p className="dq-eyebrow">Portfolio IQ lens</p>
          <h2 id="properties-heading" className="dq-h2">Properties and local exposure</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Customer-facing readiness stays simple. Dwellsy handles identity resolution, URU coverage, operator outreach, and comp construction behind the scenes.
          </p>
        </div>
        <div className="mt-5 overflow-hidden rounded-lg border border-grid bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-surface-soft text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-bold">Property</th>
                  <th className="px-5 py-3 font-bold">Product</th>
                  <th className="px-5 py-3 font-bold">Operator observed</th>
                  <th className="px-5 py-3 font-bold">Local asking market</th>
                  <th className="px-5 py-3 font-bold">Comps</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-grid">
                {assets.map((asset) => {
                  const place = cityPulseByName.get(cityKey(asset.city));
                  return (
                    <tr key={asset.id} className="align-top hover:bg-surface-soft/50">
                      <td className="px-5 py-4">
                        <Link href={`/portfolio-iq/properties/${asset.slug}`} className="font-semibold text-navy hover:text-teal-700 hover:underline">
                          {asset.name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">{asset.canonicalAddress}, {asset.city} {asset.postalCode}</p>
                        {asset.buildings.length > 1 && <p className="mt-1 text-xs text-teal-700">{asset.buildings.length} buildings in this community</p>}
                      </td>
                      <td className="px-5 py-4 text-foreground/75">{asset.assetType === "single_family" ? "Single-family" : "Multifamily"}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-navy">{asset.observedOperatorName ?? "Being confirmed"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Observed, not contract verified</p>
                      </td>
                      <td className="px-5 py-4 text-foreground/75">{localMarketText(place)}</td>
                      <td className="px-5 py-4 text-foreground/75">{compLabel(asset.compSetStatus)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${readinessClass(asset.readinessStatus)}`}>
                          {readinessLabel(asset.readinessStatus)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-grid bg-surface-soft p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="dq-eyebrow">One Dwellsy IQ workspace</p>
            <h2 className="dq-h2">Market context, portfolio relevance, operator accountability</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Market IQ explains what is happening around an asset. Portfolio IQ shows where that change matters to you. Operator IQ shows how the managers responsible for execution compare with their peers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/market-iq" className="rounded-md border border-grid bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-surface-soft">Market IQ</Link>
            <Link href="/property-managers" className="rounded-md border border-grid bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-surface-soft">Operator IQ</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="portfolio-digest-heading" className="mt-10 rounded-xl border border-teal/25 bg-teal-soft p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="dq-eyebrow">Weekly narrative</p>
            <h2 id="portfolio-digest-heading" className="dq-h2">Bring the decisions to your inbox</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Dwellsy IQ sends the unified owner briefing only when its market, asset, operator, or decision evidence materially changes and the weekly cadence is due.</p>
            <form action={updatePortfolioDigestPreference} className="mt-4 flex flex-wrap items-center gap-3">
              <input type="hidden" name="portfolioId" value={portfolio.id} />
              <label className="flex items-center gap-2 text-sm font-medium text-navy">
                <input type="checkbox" name="enabled" defaultChecked={digestPreference?.enabled ?? false} />
                Email me the weekly owner briefing
              </label>
              <button className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white">Save preference</button>
            </form>
          </div>
          <PortfolioWatchDigestPanel />
        </div>
      </section>
    </main>
  );
}
