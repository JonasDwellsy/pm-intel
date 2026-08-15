import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { MarketIqReportHistory } from "@/components/market-iq/MarketIqReportHistory";
import { MarketIqReportComposerClient } from "@/components/market-iq/report/MarketIqReportComposerClient";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { canAccessMarketIqReportComposer } from "@/lib/market-iq/report/access";
import { loadMarketIqReportComposer } from "@/lib/market-iq/report/composer.server";

export const dynamic = "force-dynamic";

export default async function MarketIqReportComposerPage({ searchParams }: { searchParams: Promise<{ published?: string; delivery?: string; activated?: string }> }) {
  const previewEnabled = marketIqPreviewEnabled();
  if (!previewEnabled) notFound();
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const access = await resolveViewerMarketIqAccess();
  if (!canAccessMarketIqReportComposer({ previewEnabled, userId, organizationId, hasProduct: access.hasProduct, marketEntitled: isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID) })) notFound();
  const composer = await loadMarketIqReportComposer(organizationId);
  if (!composer) notFound();
  const query = await searchParams;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><span>Client report</span><span>·</span><Link href="/market-iq/distribution" className="hover:text-teal-700">Recipients and distribution</Link></nav>
    {query.activated === "1" && <p className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Setup complete. Your saved brand and market defaults are loaded below.</p>}
    <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end">
      <div><p className="dq-eyebrow">Client advisory</p><h1 className="dq-h1">Prepare a Cleveland local market read</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">Turn validated Trends IQ rent levels and direction into an interactive, client-ready read under your firm’s brand. Publishing freezes the evidence and creates a revocable public link.</p></div>
      <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Owner-facing boundary</p><p className="mt-2 text-lg font-semibold text-navy">The market, not the owner</p><p className="mt-2 text-sm leading-6 text-foreground/75">No owner scoring, competitor identities, operator rankings, or modeled rent estimates are included.</p></aside>
    </header>

    <MarketIqReportComposerClient snapshot={composer.preview.snapshot} initialBrand={composer.brand} initialSelection={composer.initialSelection} source={composer.preview.source} priorEdition={composer.priorEdition} />
    <section className="mt-8 max-w-xl"><MarketIqReportHistory reports={composer.organization.marketIqReports} highlightedId={query.published} delivery={query.delivery} /></section>
  </main>;
}
