"use client";

import { useMemo, useState } from "react";
import { completeMarketIqActivation, saveMarketIqActivationProgress } from "@/app/market-iq/get-started/actions";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import {
  applyMarketIqReportScope,
  buildMarketIqCoveragePreflight,
  MARKET_IQ_REPORT_CITIES,
  MARKET_IQ_REPORT_SEGMENTS,
  MARKET_IQ_REPORT_ZIPS,
  type MarketIqReportScopeSelection,
  type MarketIqSegmentKey,
} from "@/lib/market-iq/report/scope";

type Brand = MarketIqReportSnapshot["brand"];

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function Choice({ value, label, checked, onChange }: { value: string; label: string; checked: boolean; onChange: () => void }) {
  return <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${checked ? "border-teal-300 bg-teal-50 text-navy" : "border-slate-200 bg-white text-slate-500"}`}>
    <input type="checkbox" value={value} checked={checked} onChange={onChange} className="accent-teal-700" />{label}
  </label>;
}

export function MarketIqActivationFlow({ snapshot, initialBrand, initialSelection, initialStep, source, completed }: { snapshot: MarketIqReportSnapshot; initialBrand: Brand; initialSelection: MarketIqReportScopeSelection; initialStep: number; source: "dwellsy_trends" | "verified_seed"; completed: boolean }) {
  const [step, setStep] = useState(initialStep);
  const [brand, setBrand] = useState(initialBrand);
  const [selection, setSelection] = useState(initialSelection);
  const preview = useMemo(() => applyMarketIqReportScope({ ...snapshot, brand }, selection), [snapshot, brand, selection]);
  const coverage = useMemo(() => buildMarketIqCoveragePreflight(preview), [preview]);
  const validBrand = brand.displayName.trim().length >= 2;
  const validScope = selection.segments.length > 0 && selection.cities.length + selection.zipCodes.length > 0;

  function updateBrand<K extends keyof Brand>(key: K, value: Brand[K]) {
    setBrand((current) => ({ ...current, [key]: value }));
  }

  return <form action={completeMarketIqActivation} className="mt-8">
    <input type="hidden" name="displayName" value={brand.displayName} />
    <input type="hidden" name="logoUrl" value={brand.logoUrl ?? ""} />
    <input type="hidden" name="primaryColor" value={brand.primaryColor} />
    <input type="hidden" name="accentColor" value={brand.accentColor} />
    <input type="hidden" name="contactName" value={brand.contactName ?? ""} />
    <input type="hidden" name="contactEmail" value={brand.contactEmail ?? ""} />
    <input type="hidden" name="contactPhone" value={brand.contactPhone ?? ""} />
    <input type="hidden" name="websiteUrl" value={brand.websiteUrl ?? ""} />
    {selection.cities.map((city) => <input key={`city:${city}`} type="hidden" name="cities" value={city} />)}
    {selection.zipCodes.map((zip) => <input key={`zip:${zip}`} type="hidden" name="zipCodes" value={zip} />)}
    {selection.segments.map((segment) => <input key={`segment:${segment}`} type="hidden" name="segments" value={segment} />)}
    <div className="grid gap-3 sm:grid-cols-3">{["Your firm", "Your market read", "Review"].map((label, index) => <button key={label} type="button" onClick={() => setStep(index + 1)} className={`rounded-xl border px-4 py-3 text-left ${step === index + 1 ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-500"}`}><span className="block text-[10px] font-bold uppercase tracking-[0.13em]">Step {index + 1}</span><span className="mt-1 block text-sm font-semibold">{label}</span></button>)}</div>

    {step === 1 && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="dq-eyebrow">Client-facing identity</p><h2 className="dq-h2">Make every read feel like it came from your firm</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">These details appear on the interactive report and its email. Dwellsy appears only as the market-data credit.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-navy sm:col-span-2">Firm name<input required value={brand.displayName} onChange={(event) => updateBrand("displayName", event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-semibold text-navy sm:col-span-2">Logo URL, optional<input type="url" value={brand.logoUrl ?? ""} onChange={(event) => updateBrand("logoUrl", event.target.value || null)} placeholder="https://yourfirm.com/logo.png" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /><span className="mt-1 block text-xs font-normal text-slate-400">Use a public HTTPS image URL. Logo upload can be added when asset storage is configured.</span></label>
        <label className="text-sm font-semibold text-navy">Primary color<input type="color" value={brand.primaryColor} onChange={(event) => updateBrand("primaryColor", event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-white p-1" /></label>
        <label className="text-sm font-semibold text-navy">Accent color<input type="color" value={brand.accentColor} onChange={(event) => updateBrand("accentColor", event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-white p-1" /></label>
        <label className="text-sm font-semibold text-navy">Contact name<input value={brand.contactName ?? ""} onChange={(event) => updateBrand("contactName", event.target.value || null)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-semibold text-navy">Reply-to email<input type="email" value={brand.contactEmail ?? ""} onChange={(event) => updateBrand("contactEmail", event.target.value || null)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-semibold text-navy">Contact phone<input value={brand.contactPhone ?? ""} onChange={(event) => updateBrand("contactPhone", event.target.value || null)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label>
        <label className="text-sm font-semibold text-navy">Website<input type="url" value={brand.websiteUrl ?? ""} onChange={(event) => updateBrand("websiteUrl", event.target.value || null)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label>
      </div>
      <button formAction={saveMarketIqActivationProgress} name="nextStep" value="2" disabled={!validBrand} className="mt-7 rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">Save and continue</button>
    </section>}

    {step === 2 && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="dq-eyebrow">Reusable defaults</p><h2 className="dq-h2">Choose what should open first</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">You can change the scope for any individual report. These selections simply make the usual report faster to prepare.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <fieldset><legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Cities</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{MARKET_IQ_REPORT_CITIES.map((city) => <Choice key={city} value={city} label={city} checked={selection.cities.includes(city)} onChange={() => setSelection((current) => ({ ...current, cities: toggle(current.cities, city) }))} />)}</div></fieldset>
        <fieldset><legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Product segments</legend><div className="mt-3 grid gap-2">{MARKET_IQ_REPORT_SEGMENTS.map((segment) => <Choice key={segment.key} value={segment.key} label={segment.label} checked={selection.segments.includes(segment.key)} onChange={() => setSelection((current) => ({ ...current, segments: toggle(current.segments, segment.key) as MarketIqSegmentKey[] }))} />)}</div></fieldset>
      </div>
      <fieldset className="mt-6"><div className="flex items-center justify-between gap-3"><legend className="text-xs font-bold uppercase tracking-wider text-slate-500">ZIP codes</legend><button type="button" onClick={() => setSelection((current) => ({ ...current, zipCodes: current.zipCodes.length === MARKET_IQ_REPORT_ZIPS.length ? [] : [...MARKET_IQ_REPORT_ZIPS] }))} className="text-xs font-semibold text-teal-700">{selection.zipCodes.length === MARKET_IQ_REPORT_ZIPS.length ? "Clear all" : "Use market-wide default"}</button></div><div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200 p-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">{MARKET_IQ_REPORT_ZIPS.map((zip) => <Choice key={zip} value={zip} label={zip} checked={selection.zipCodes.includes(zip)} onChange={() => setSelection((current) => ({ ...current, zipCodes: toggle(current.zipCodes, zip) }))} />)}</div></div></fieldset>
      <div className="mt-7 flex flex-wrap gap-3"><button formAction={saveMarketIqActivationProgress} name="nextStep" value="3" disabled={!validScope} className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">Save and review</button><button formAction={saveMarketIqActivationProgress} name="nextStep" value="2" className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-navy">Save for later</button></div>
    </section>}

    {step === 3 && <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="dq-eyebrow">Ready to activate</p><h2 className="dq-h2">Your first recurring edition starts here</h2><p className="mt-2 text-sm text-slate-600">{selection.cities.length} cities, {selection.zipCodes.length} ZIPs, and {selection.segments.length} product segments selected.</p></div><div className="flex gap-3"><button type="button" onClick={() => setStep(2)} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy">Edit</button><button disabled={!validBrand || !validScope} className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-white">{completed ? "Save changes and open edition" : "Activate and prepare first edition"}</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><article className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{coverage.counts.reportable}</p><p className="mt-1 text-xs text-slate-500">reportable Trends IQ cells</p></article><article className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{coverage.counts.unavailable}</p><p className="mt-1 text-xs text-slate-500">unavailable combinations disclosed</p></article><article className={`rounded-xl p-4 ${source === "dwellsy_trends" ? "bg-emerald-50" : "bg-amber-50"}`}><p className="text-sm font-semibold text-navy">{source === "dwellsy_trends" ? "Live Trends IQ" : "Preview seed"}</p><p className="mt-1 text-xs text-slate-500">{source === "dwellsy_trends" ? "Ready for edition review" : "Activation can continue; publication remains blocked"}</p></article></div></div>
      <div className="max-h-[760px] overflow-y-auto"><MarketIqPublicReport report={preview} preview /></div>
    </section>}
  </form>;
}
