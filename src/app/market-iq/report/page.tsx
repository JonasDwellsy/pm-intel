import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { MarketIqReportHistory } from "@/components/market-iq/MarketIqReportHistory";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { canAccessMarketIqReportComposer } from "@/lib/market-iq/report/access";
import { loadMarketIqReportComposer } from "@/lib/market-iq/report/composer.server";
import { publishMarketIqReport } from "./actions";

export const dynamic = "force-dynamic";

function money(value: number | null) {
  return value === null ? "Not published" : `$${Math.round(value).toLocaleString("en-US")}`;
}

function position(value: number | null) {
  if (value === null) return "Not published";
  return `${Math.abs(value).toFixed(1)}% ${value >= 0 ? "above" : "below"} market`;
}

export default async function MarketIqReportComposerPage({ searchParams }: { searchParams: Promise<{ published?: string; delivery?: string }> }) {
  const previewEnabled = marketIqPreviewEnabled();
  if (!previewEnabled) notFound();
  const hasProduct = await viewerHasProductAccess("market_iq");
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  const entitlement = await resolveViewerEntitlement();
  if (!canAccessMarketIqReportComposer({ previewEnabled, userId, organizationId, hasProduct, marketEntitled: isMarketEntitled(entitlement, CLEVELAND_MARKET_ID) })) notFound();
  const composer = await loadMarketIqReportComposer(organizationId);
  if (!composer) notFound();
  const query = await searchParams;
  const { snapshot } = composer.preview;
  const style = {
    "--composer-primary": composer.brand.primaryColor,
    "--composer-accent": composer.brand.accentColor,
  } as CSSProperties;

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Link href="/market-iq" className="hover:text-teal-700">Market IQ</Link><span>/</span><span>Client report</span></nav>
    <header className="grid gap-7 border-b border-grid pb-8 lg:grid-cols-[1fr_360px] lg:items-end">
      <div><p className="dq-eyebrow">Client advisory</p><h1 className="dq-h1">Prepare a Cleveland market report</h1><p className="mt-3 max-w-3xl text-[15px] leading-6 text-muted-foreground">Turn your managed portfolio’s observed asking position into a client-ready report under your firm’s brand. Publishing freezes the evidence and creates a revocable public link.</p></div>
      <aside className="rounded-xl border border-teal/25 bg-teal-soft p-5"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Owner-facing boundary</p><p className="mt-2 text-lg font-semibold text-navy">Portfolio and market only</p><p className="mt-2 text-sm leading-6 text-foreground/75">No operator rankings, competitor identities, watchlists, or unrelated portfolio information are included.</p></aside>
    </header>

    <section className="mt-8 grid gap-7 xl:grid-cols-[370px_1fr]">
      <aside className="space-y-6">
        <form action={publishMarketIqReport} className="rounded-xl border border-grid bg-white p-5 shadow-sm">
          <p className="dq-eyebrow">Report setup</p><h2 className="dq-h2">Scope and branding</h2>
          <div className="mt-5 grid gap-4">
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Market<select name="marketId" defaultValue={CLEVELAND_MARKET_ID} className="mt-2 w-full rounded-md border border-grid bg-surface-soft px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy"><option value={CLEVELAND_MARKET_ID}>Cleveland–Elyria, OH</option></select></label>
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Owner portfolio<select name="portfolioScope" defaultValue="cleveland-demo-owner" className="mt-2 w-full rounded-md border border-grid bg-surface-soft px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy"><option value="cleveland-demo-owner">Cleveland Managed Portfolio · 5 communities</option></select></label>
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Period<select name="period" defaultValue="trailing-12-months" className="mt-2 w-full rounded-md border border-grid bg-surface-soft px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy"><option value="trailing-12-months">Trailing 12 months through July 31, 2026</option></select></label>
            <div className="border-t border-grid pt-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Your client-facing brand</p></div>
            <label className="text-sm font-semibold text-navy">Firm name<input name="displayName" required minLength={2} maxLength={120} defaultValue={composer.brand.displayName} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Logo URL, optional<input name="logoUrl" type="url" maxLength={500} defaultValue={composer.brand.logoUrl ?? ""} placeholder="https://yourfirm.com/logo.png" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-navy">Primary<input name="primaryColor" type="color" defaultValue={composer.brand.primaryColor} className="mt-2 h-11 w-full rounded-md border border-grid bg-white p-1" /></label><label className="text-sm font-semibold text-navy">Accent<input name="accentColor" type="color" defaultValue={composer.brand.accentColor} className="mt-2 h-11 w-full rounded-md border border-grid bg-white p-1" /></label></div>
            <label className="text-sm font-semibold text-navy">Contact name<input name="contactName" maxLength={120} defaultValue={composer.brand.contactName ?? ""} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Contact email<input name="contactEmail" type="email" maxLength={254} defaultValue={composer.brand.contactEmail ?? ""} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Contact phone<input name="contactPhone" maxLength={40} defaultValue={composer.brand.contactPhone ?? ""} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Website<input name="websiteUrl" type="url" maxLength={500} defaultValue={composer.brand.websiteUrl ?? ""} placeholder="https://yourfirm.com" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <button className="mt-1 rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white hover:bg-navy/90">Publish client report</button>
            <p className="text-xs leading-5 text-muted-foreground">Publishing creates a new immutable snapshot. It does not send an email automatically.</p>
          </div>
        </form>

        <MarketIqReportHistory reports={composer.organization.marketIqReports} highlightedId={query.published} delivery={query.delivery} />
      </aside>

      <div style={style} className="overflow-hidden rounded-2xl border border-grid bg-[#f7f6f2] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-grid bg-white px-6 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Client-facing preview</p><p className="mt-1 text-sm font-semibold text-navy">{composer.brand.displayName}</p></div><span className="rounded-full bg-surface-soft px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{composer.preview.source === "analytical_store" ? "Built from isolated market store" : "Verified Cleveland seed"}</span></div>
        <div className="p-6 sm:p-9 lg:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--composer-accent)]">{snapshot.scope.marketName}</p><h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-[var(--composer-primary)]">Your portfolio’s position in the asking market</h2><p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">{snapshot.portfolioPosition.narrative}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">{snapshot.portfolioPosition.portfolioWide.map((cell) => <article key={cell.key} className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{cell.label}</p><p className="mt-4 text-2xl font-semibold text-[var(--composer-primary)]">{money(cell.portfolio.medianAskingRent)}</p><p className="mt-1 text-xs font-semibold text-[var(--composer-accent)]">{position(cell.positionPct)}</p><p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{cell.portfolio.observations} portfolio · {cell.market.observations} market observations</p></article>)}</div>
          <section className="mt-8 rounded-xl bg-[var(--composer-primary)] p-6 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/65">Market context</p><h3 className="mt-3 text-2xl font-semibold">{snapshot.marketConditions.heading}</h3><p className="mt-3 text-sm leading-6 text-white/75">{snapshot.marketConditions.narrative}</p></section>
          <div className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500"><p>{snapshot.disclosure}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="font-semibold text-slate-700">Prepared by {composer.brand.displayName}</p><p className="font-semibold uppercase tracking-[0.12em] text-slate-400">Market data by Dwellsy IQ</p></div></div>
        </div>
      </div>
    </section>
  </main>;
}
