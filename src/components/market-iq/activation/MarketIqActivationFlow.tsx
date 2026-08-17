"use client";

import { useMemo, useState } from "react";
import { completeMarketIqActivation, saveMarketIqActivationProgress } from "@/app/market-iq/get-started/actions";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import type { MarketIqEditorialDefaults } from "@/lib/market-iq/report/composer.server";
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

export function MarketIqActivationFlow({ snapshot, initialBrand, initialEditorialDefaults, initialSelection, initialStep, source, completed, clientAdvisoryEnabled }: { snapshot: MarketIqReportSnapshot; initialBrand: Brand; initialEditorialDefaults: MarketIqEditorialDefaults; initialSelection: MarketIqReportScopeSelection; initialStep: number; source: "dwellsy_trends" | "verified_seed"; completed: boolean; clientAdvisoryEnabled: boolean }) {
  const [step, setStep] = useState(clientAdvisoryEnabled ? initialStep : initialStep === 3 ? 3 : 2);
  const [brand, setBrand] = useState(initialBrand);
  const [editorialDefaults, setEditorialDefaults] = useState(initialEditorialDefaults);
  const [selection, setSelection] = useState(initialSelection);
  const preview = useMemo(() => applyMarketIqReportScope({
    ...snapshot,
    brand,
    editorial: clientAdvisoryEnabled ? {
      audienceKind: "client",
      headline: snapshot.editorial?.headline ?? null,
      introduction: editorialDefaults.defaultClientMessage,
      companyProfile: editorialDefaults.companyProfile,
      companyCtaLabel: editorialDefaults.companyCtaLabel,
      companyCtaUrl: editorialDefaults.companyCtaUrl,
      reviewedAt: snapshot.generatedAt,
      reviewedBy: "Workspace default preview",
    } : snapshot.editorial,
  }, selection), [snapshot, brand, editorialDefaults, selection, clientAdvisoryEnabled]);
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
    <input type="hidden" name="defaultClientMessage" value={editorialDefaults.defaultClientMessage ?? ""} />
    <input type="hidden" name="defaultProspectMessage" value={editorialDefaults.defaultProspectMessage ?? ""} />
    <input type="hidden" name="companyProfile" value={editorialDefaults.companyProfile ?? ""} />
    <input type="hidden" name="companyCtaLabel" value={editorialDefaults.companyCtaLabel ?? ""} />
    <input type="hidden" name="companyCtaUrl" value={editorialDefaults.companyCtaUrl ?? ""} />
    {selection.cities.map((city) => <input key={`city:${city}`} type="hidden" name="cities" value={city} />)}
    {selection.zipCodes.map((zip) => <input key={`zip:${zip}`} type="hidden" name="zipCodes" value={zip} />)}
    {selection.segments.map((segment) => <input key={`segment:${segment}`} type="hidden" name="segments" value={segment} />)}
    <div className={`grid gap-3 ${clientAdvisoryEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>{(clientAdvisoryEnabled ? [{ step: 1, label: "Your firm" }, { step: 2, label: "Your market read" }, { step: 3, label: "Review" }] : [{ step: 2, label: "Your market read" }, { step: 3, label: "Review" }]).map((item, index) => <button key={item.label} type="button" onClick={() => setStep(item.step)} className={`rounded-xl border px-4 py-3 text-left ${step === item.step ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-500"}`}><span className="block text-[10px] font-bold uppercase tracking-[0.13em]">Step {index + 1}</span><span className="mt-1 block text-sm font-semibold">{item.label}</span></button>)}</div>

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
      {clientAdvisoryEnabled && <div className="mt-8 border-t border-slate-200 pt-7"><p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-700">Advisory messaging defaults</p><h3 className="mt-2 text-xl font-semibold text-navy">Start each edition with the right relationship context</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">These are starting points, not locked copy. Client and prospect reports receive separate messages, while your company profile and CTA can appear in both. Every edition remains editable before publication.</p><div className="mt-5 grid gap-4 lg:grid-cols-2"><label className="text-sm font-semibold text-navy">Default client message<textarea maxLength={700} rows={5} value={editorialDefaults.defaultClientMessage ?? ""} onChange={(event) => setEditorialDefaults((current) => ({ ...current, defaultClientMessage: event.target.value || null }))} placeholder="Add the context or advice you typically want current clients to see." className="mt-2 w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 font-normal leading-6" /></label><label className="text-sm font-semibold text-navy">Default prospect message<textarea maxLength={700} rows={5} value={editorialDefaults.defaultProspectMessage ?? ""} onChange={(event) => setEditorialDefaults((current) => ({ ...current, defaultProspectMessage: event.target.value || null }))} placeholder="Explain why this local market read is useful to a prospective client." className="mt-2 w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 font-normal leading-6" /></label><label className="text-sm font-semibold text-navy lg:col-span-2">About your company<textarea maxLength={700} rows={4} value={editorialDefaults.companyProfile ?? ""} onChange={(event) => setEditorialDefaults((current) => ({ ...current, companyProfile: event.target.value || null }))} placeholder="Describe who you serve, where you operate, and what distinguishes your management approach." className="mt-2 w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 font-normal leading-6" /></label><label className="text-sm font-semibold text-navy">CTA label<input maxLength={60} value={editorialDefaults.companyCtaLabel ?? ""} onChange={(event) => setEditorialDefaults((current) => ({ ...current, companyCtaLabel: event.target.value || null }))} placeholder="Talk with our team" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-navy">CTA URL<input type="url" maxLength={500} value={editorialDefaults.companyCtaUrl ?? ""} onChange={(event) => setEditorialDefaults((current) => ({ ...current, companyCtaUrl: event.target.value || null }))} placeholder="https://yourfirm.com/contact" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 font-normal" /></label></div></div>}
      <button formAction={saveMarketIqActivationProgress} name="nextStep" value="2" disabled={!validBrand} className="mt-7 rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">Save and continue</button>
    </section>}

    {step === 2 && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="dq-eyebrow">Your market scope</p><h2 className="dq-h2">Choose what should open first</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{clientAdvisoryEnabled ? "You can change the scope for any individual edition. These selections make the usual client read faster to prepare." : "Choose the cities, ZIPs, and rental segments your team follows most often. You can change the view at any time."}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <fieldset><legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Cities</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{MARKET_IQ_REPORT_CITIES.map((city) => <Choice key={city} value={city} label={city} checked={selection.cities.includes(city)} onChange={() => setSelection((current) => ({ ...current, cities: toggle(current.cities, city) }))} />)}</div></fieldset>
        <fieldset><legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Product segments</legend><div className="mt-3 grid gap-2">{MARKET_IQ_REPORT_SEGMENTS.map((segment) => <Choice key={segment.key} value={segment.key} label={segment.label} checked={selection.segments.includes(segment.key)} onChange={() => setSelection((current) => ({ ...current, segments: toggle(current.segments, segment.key) as MarketIqSegmentKey[] }))} />)}</div></fieldset>
      </div>
      <fieldset className="mt-6"><div className="flex items-center justify-between gap-3"><legend className="text-xs font-bold uppercase tracking-wider text-slate-500">ZIP codes</legend><button type="button" onClick={() => setSelection((current) => ({ ...current, zipCodes: current.zipCodes.length === MARKET_IQ_REPORT_ZIPS.length ? [] : [...MARKET_IQ_REPORT_ZIPS] }))} className="text-xs font-semibold text-teal-700">{selection.zipCodes.length === MARKET_IQ_REPORT_ZIPS.length ? "Clear all" : "Use market-wide default"}</button></div><div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200 p-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">{MARKET_IQ_REPORT_ZIPS.map((zip) => <Choice key={zip} value={zip} label={zip} checked={selection.zipCodes.includes(zip)} onChange={() => setSelection((current) => ({ ...current, zipCodes: toggle(current.zipCodes, zip) }))} />)}</div></div></fieldset>
      <div className="mt-7 flex flex-wrap gap-3"><button formAction={saveMarketIqActivationProgress} name="nextStep" value="3" disabled={!validScope} className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-white disabled:bg-slate-300">Save and review</button><button formAction={saveMarketIqActivationProgress} name="nextStep" value="2" className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-navy">Save for later</button></div>
    </section>}

    {step === 3 && <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="dq-eyebrow">Ready to activate</p><h2 className="dq-h2">{clientAdvisoryEnabled ? "Your first recurring edition starts here" : "Your Cleveland intelligence workspace is ready"}</h2><p className="mt-2 text-sm text-slate-600">{selection.cities.length} cities, {selection.zipCodes.length} ZIPs, and {selection.segments.length} product segments selected.</p></div><div className="flex gap-3"><button type="button" onClick={() => setStep(2)} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy">Edit</button><button disabled={!validBrand || !validScope} className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-white">{completed ? (clientAdvisoryEnabled ? "Save changes and open edition" : "Save changes and open market") : (clientAdvisoryEnabled ? "Activate and prepare first edition" : "Activate and open market")}</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><article className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{coverage.counts.reportable}</p><p className="mt-1 text-xs text-slate-500">reportable Trends IQ cells</p></article><article className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-navy">{coverage.counts.unavailable}</p><p className="mt-1 text-xs text-slate-500">unavailable combinations disclosed</p></article><article className={`rounded-xl p-4 ${source === "dwellsy_trends" ? "bg-emerald-50" : "bg-amber-50"}`}><p className="text-sm font-semibold text-navy">{source === "dwellsy_trends" ? "Live Trends IQ" : "Preview seed"}</p><p className="mt-1 text-xs text-slate-500">{source === "dwellsy_trends" ? (clientAdvisoryEnabled ? "Ready for edition review" : "Ready for market exploration") : "Activation can continue; publication remains blocked"}</p></article></div></div>
      <div className="max-h-[760px] overflow-y-auto"><MarketIqPublicReport report={preview} preview /></div>
    </section>}
  </form>;
}
