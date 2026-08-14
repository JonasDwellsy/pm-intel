"use client";

import { useMemo, useState } from "react";
import { publishMarketIqReport } from "@/app/market-iq/report/actions";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import {
  applyMarketIqReportScope,
  buildMarketIqCoveragePreflight,
  defaultMarketIqScopeSelection,
  MARKET_IQ_REPORT_CITIES,
  MARKET_IQ_REPORT_SEGMENTS,
  MARKET_IQ_REPORT_ZIPS,
  type MarketIqCoverageStatus,
  type MarketIqReportScopeSelection,
  type MarketIqSegmentKey,
} from "@/lib/market-iq/report/scope";

type Brand = MarketIqReportSnapshot["brand"];

const STATUS_STYLE: Record<MarketIqCoverageStatus, string> = {
  reportable: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  thin: "bg-amber-50 text-amber-800 ring-amber-200",
  stale: "bg-orange-50 text-orange-800 ring-orange-200",
  unavailable: "bg-slate-100 text-slate-500 ring-slate-200",
};

function toggleValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function ScopeOption({ name, value, label, checked, onChange }: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${checked ? "border-teal-300 bg-teal-50 text-navy" : "border-grid bg-white text-muted-foreground hover:border-slate-400"}`}>
    <input type="checkbox" name={name} value={value} checked={checked} onChange={onChange} className="h-4 w-4 accent-teal-700" />
    <span>{label}</span>
  </label>;
}

function CoverageSummary({ status, count }: { status: MarketIqCoverageStatus; count: number }) {
  return <div className={`rounded-xl px-4 py-3 ring-1 ${STATUS_STYLE[status]}`}><p className="text-2xl font-semibold">{count}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em]">{status}</p></div>;
}

export function MarketIqReportComposerClient({ snapshot, initialBrand, source }: {
  snapshot: MarketIqReportSnapshot;
  initialBrand: Brand;
  source: "analytical_store" | "verified_seed";
}) {
  const [selection, setSelection] = useState<MarketIqReportScopeSelection>(defaultMarketIqScopeSelection());
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const scopedSnapshot = useMemo(() => applyMarketIqReportScope({
    ...snapshot,
    brand: {
      ...brand,
      logoUrl: brand.logoUrl?.startsWith("https://") ? brand.logoUrl : null,
      websiteUrl: brand.websiteUrl?.startsWith("https://") ? brand.websiteUrl : null,
    },
  }, selection), [snapshot, selection, brand]);
  const coverage = useMemo(() => buildMarketIqCoveragePreflight(scopedSnapshot), [scopedSnapshot]);
  const groupedCoverage = Object.entries(coverage.cells.reduce<Record<string, typeof coverage.cells>>((groups, cell) => {
    (groups[cell.geographyLabel] ??= []).push(cell);
    return groups;
  }, {}));
  const hasGeography = selection.cities.length + selection.zipCodes.length > 0;
  const canPublish = coverage.canPublish && hasGeography && selection.segments.length > 0;

  function updateBrand<K extends keyof Brand>(key: K, value: Brand[K]) {
    setBrand((current) => ({ ...current, [key]: value }));
  }

  return <>
    <section className="mt-8 grid gap-7 xl:grid-cols-[390px_1fr]">
      <form action={publishMarketIqReport} className="h-fit rounded-xl border border-grid bg-white p-5 shadow-sm">
        <p className="dq-eyebrow">Report setup</p><h2 className="dq-h2">Choose the local read</h2>
        <div className="mt-5 grid gap-5">
          <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Market<select name="marketId" defaultValue={snapshot.scope.marketId} className="mt-2 w-full rounded-md border border-grid bg-surface-soft px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy"><option value={snapshot.scope.marketId}>{snapshot.scope.marketName}</option></select></label>

          <fieldset><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Cities</legend><div className="mt-2 grid gap-2">{MARKET_IQ_REPORT_CITIES.map((city) => <ScopeOption key={city} name="cities" value={city} label={city} checked={selection.cities.includes(city)} onChange={() => setSelection((current) => ({ ...current, cities: toggleValue(current.cities, city) }))} />)}</div></fieldset>
          <fieldset><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">ZIP codes</legend><div className="mt-2 grid grid-cols-2 gap-2">{MARKET_IQ_REPORT_ZIPS.map((zip) => <ScopeOption key={zip} name="zipCodes" value={zip} label={zip} checked={selection.zipCodes.includes(zip)} onChange={() => setSelection((current) => ({ ...current, zipCodes: toggleValue(current.zipCodes, zip) }))} />)}</div></fieldset>
          <fieldset><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Product segments</legend><div className="mt-2 grid gap-2">{MARKET_IQ_REPORT_SEGMENTS.map((segment) => <ScopeOption key={segment.key} name="segments" value={segment.key} label={segment.label} checked={selection.segments.includes(segment.key)} onChange={() => setSelection((current) => ({ ...current, segments: toggleValue(current.segments, segment.key as MarketIqSegmentKey) }))} />)}</div></fieldset>

          <div className="border-t border-grid pt-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Your client-facing brand</p></div>
          <label className="text-sm font-semibold text-navy">Firm name<input name="displayName" required minLength={2} maxLength={120} value={brand.displayName} onChange={(event) => updateBrand("displayName", event.target.value)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
          <label className="text-sm font-semibold text-navy">Logo URL, optional<input name="logoUrl" type="url" maxLength={500} value={brand.logoUrl ?? ""} onChange={(event) => updateBrand("logoUrl", event.target.value || null)} placeholder="https://yourfirm.com/logo.png" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-navy">Primary<input name="primaryColor" type="color" value={brand.primaryColor} onChange={(event) => updateBrand("primaryColor", event.target.value)} className="mt-2 h-11 w-full rounded-md border border-grid bg-white p-1" /></label><label className="text-sm font-semibold text-navy">Accent<input name="accentColor" type="color" value={brand.accentColor} onChange={(event) => updateBrand("accentColor", event.target.value)} className="mt-2 h-11 w-full rounded-md border border-grid bg-white p-1" /></label></div>
          <label className="text-sm font-semibold text-navy">Contact name<input name="contactName" maxLength={120} value={brand.contactName ?? ""} onChange={(event) => updateBrand("contactName", event.target.value || null)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
          <label className="text-sm font-semibold text-navy">Contact email<input name="contactEmail" type="email" maxLength={254} value={brand.contactEmail ?? ""} onChange={(event) => updateBrand("contactEmail", event.target.value || null)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
          <label className="text-sm font-semibold text-navy">Contact phone<input name="contactPhone" maxLength={40} value={brand.contactPhone ?? ""} onChange={(event) => updateBrand("contactPhone", event.target.value || null)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
          <label className="text-sm font-semibold text-navy">Website<input name="websiteUrl" type="url" maxLength={500} value={brand.websiteUrl ?? ""} onChange={(event) => updateBrand("websiteUrl", event.target.value || null)} placeholder="https://yourfirm.com" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>

          <button disabled={!canPublish} className="mt-1 rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-slate-300">Publish immutable report</button>
          <p className="text-xs leading-5 text-muted-foreground">Publishing freezes exactly the selected evidence and brand shown in the preview. It creates a revocable link but does not send an email automatically.</p>
          {!canPublish && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">Select at least one geography and segment with a reportable Trends IQ cell before publishing.</p>}
        </div>
      </form>

      <section className="rounded-xl border border-grid bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="dq-eyebrow">Pre-publication check</p><h2 className="dq-h2">What the client will and will not see</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Every selected geography and segment is checked against the latest landed Trends IQ month. Thin, stale, and missing cells stay visible here but publish without a rent value.</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${source === "analytical_store" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{source === "analytical_store" ? "Landed analytical data" : "Verified preview seed"}</span></div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><CoverageSummary status="reportable" count={coverage.counts.reportable} /><CoverageSummary status="thin" count={coverage.counts.thin} /><CoverageSummary status="stale" count={coverage.counts.stale} /><CoverageSummary status="unavailable" count={coverage.counts.unavailable} /></div>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">{groupedCoverage.map(([geography, cells]) => <article key={geography} className="rounded-xl border border-grid p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-navy">{geography}</h3><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{cells[0]?.geographyType}</span></div><div className="mt-3 grid gap-2">{cells.map((cell) => <div key={cell.key} title={cell.reason} className="flex items-center justify-between gap-3 rounded-lg bg-surface-soft px-3 py-2"><div><p className="text-xs font-semibold text-navy">{cell.segmentLabel}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{cell.reason}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase ring-1 ${STATUS_STYLE[cell.status]}`}>{cell.status}</span></div>)}</div></article>)}</div>
      </section>
    </section>

    <section className="mt-10 overflow-hidden rounded-2xl border border-grid bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-grid bg-white px-6 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Exact client-facing preview</p><p className="mt-1 text-sm text-muted-foreground">This shared renderer is also used by the published public link.</p></div><span className="rounded-full bg-surface-soft px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{coverage.counts.reportable} rent cells will publish</span></div>
      <MarketIqPublicReport report={scopedSnapshot} preview />
    </section>
  </>;
}
