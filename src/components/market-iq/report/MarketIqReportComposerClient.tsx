"use client";

import { useMemo, useState } from "react";
import { publishMarketIqReport } from "@/app/market-iq/report/actions";
import { MarketIqPublicReport } from "@/components/market-iq/report/MarketIqPublicReport";
import type { MarketIqReportSnapshot } from "@/lib/market-iq/report/report";
import type { MarketIqEditorialDefaults } from "@/lib/market-iq/report/composer.server";
import { compareMarketIqEditions, type PriorMarketIqEdition } from "@/lib/market-iq/report/edition-comparison";
import {
  applyMarketIqReportScope,
  buildMarketIqCoveragePreflight,
  marketIqScopeOptions,
  type MarketIqCoverageStatus,
  type MarketIqReportScopeSelection,
  type MarketIqSegmentKey,
} from "@/lib/market-iq/report/scope";

type Brand = MarketIqReportSnapshot["brand"];

const STATUS_STYLE: Record<MarketIqCoverageStatus, string> = {
  reportable: "bg-emerald-50 text-emerald-800 ring-emerald-200",
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

export function MarketIqReportComposerClient({ snapshot, initialBrand, initialEditorialDefaults, initialSelection, source, priorEdition, draftId = null, launchFlow = false }: {
  snapshot: MarketIqReportSnapshot;
  initialBrand: Brand;
  initialEditorialDefaults: MarketIqEditorialDefaults;
  initialSelection: MarketIqReportScopeSelection;
  source: "dwellsy_trends" | "verified_seed";
  priorEdition: PriorMarketIqEdition | null;
  draftId?: string | null;
  launchFlow?: boolean;
}) {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const initialAudienceKind = snapshot.editorial?.audienceKind ?? "client";
  const [selection, setSelection] = useState<MarketIqReportScopeSelection>(initialSelection);
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const [audienceKind, setAudienceKind] = useState<"client" | "prospect">(initialAudienceKind);
  const [editorialHeadline, setEditorialHeadline] = useState(snapshot.editorial?.headline ?? "");
  const [editorialIntroduction, setEditorialIntroduction] = useState(snapshot.editorial?.introduction ?? (initialAudienceKind === "prospect" ? initialEditorialDefaults.defaultProspectMessage : initialEditorialDefaults.defaultClientMessage) ?? "");
  const [companyProfile, setCompanyProfile] = useState(snapshot.editorial?.companyProfile ?? initialEditorialDefaults.companyProfile ?? "");
  const [companyCtaLabel, setCompanyCtaLabel] = useState(snapshot.editorial?.companyCtaLabel ?? initialEditorialDefaults.companyCtaLabel ?? "");
  const [companyCtaUrl, setCompanyCtaUrl] = useState(snapshot.editorial?.companyCtaUrl ?? initialEditorialDefaults.companyCtaUrl ?? "");
  const [excludedFindingIds, setExcludedFindingIds] = useState<string[]>([]);
  const scopeOptions = useMemo(() => marketIqScopeOptions(snapshot), [snapshot]);
  const scopedSnapshot = useMemo(() => applyMarketIqReportScope({
    ...snapshot,
    brand: {
      ...brand,
      logoUrl: brand.logoUrl?.startsWith("https://") ? brand.logoUrl : null,
      websiteUrl: brand.websiteUrl?.startsWith("https://") ? brand.websiteUrl : null,
    },
  }, selection), [snapshot, selection, brand]);
  const editionComparison = useMemo(() => compareMarketIqEditions(scopedSnapshot, priorEdition ? {
    ...priorEdition,
    snapshot: applyMarketIqReportScope(priorEdition.snapshot, selection),
  } : null), [scopedSnapshot, priorEdition, selection]);
  const selectedFindings = useMemo(
    () => editionComparison.findings.filter((finding) => !excludedFindingIds.includes(finding.id)),
    [editionComparison, excludedFindingIds],
  );
  const reviewedSnapshot = useMemo(() => ({
    ...scopedSnapshot,
    editionComparison: { ...editionComparison, findings: selectedFindings },
    editorial: {
      audienceKind,
      headline: editorialHeadline.trim() || null,
      introduction: editorialIntroduction.trim() || null,
      companyProfile: companyProfile.trim() || null,
      companyCtaLabel: companyCtaLabel.trim() || null,
      companyCtaUrl: companyCtaUrl.trim().startsWith("https://") ? companyCtaUrl.trim() : null,
      reviewedAt: snapshot.generatedAt,
      reviewedBy: "PM reviewer",
    },
  }), [scopedSnapshot, editionComparison, selectedFindings, audienceKind, editorialHeadline, editorialIntroduction, companyProfile, companyCtaLabel, companyCtaUrl, snapshot.generatedAt]);
  const coverage = useMemo(() => buildMarketIqCoveragePreflight(reviewedSnapshot), [reviewedSnapshot]);
  const groupedCoverage = Object.entries(coverage.cells.reduce<Record<string, typeof coverage.cells>>((groups, cell) => {
    (groups[cell.geographyLabel] ??= []).push(cell);
    return groups;
  }, {}));
  const hasGeography = selection.cities.length + selection.zipCodes.length > 0;
  const canPublish = coverage.canPublish && hasGeography && selection.segments.length > 0;

  function updateBrand<K extends keyof Brand>(key: K, value: Brand[K]) {
    setBrand((current) => ({ ...current, [key]: value }));
  }

  function selectAudience(next: "client" | "prospect") {
    setAudienceKind(next);
    setEditorialIntroduction(next === "client" ? initialEditorialDefaults.defaultClientMessage ?? "" : initialEditorialDefaults.defaultProspectMessage ?? "");
  }

  function toggleFinding(id: string) {
    setExcludedFindingIds((current) => current.includes(id) ? current.filter((findingId) => findingId !== id) : [...current, id]);
  }

  const steps = [
    { id: 1 as const, label: "Choose evidence", detail: `${selection.cities.length + selection.zipCodes.length} places · ${selection.segments.length} segments` },
    { id: 2 as const, label: "Add your perspective", detail: audienceKind === "client" ? "Current clients" : "Prospective clients" },
    { id: 3 as const, label: "Confirm your firm", detail: brand.displayName },
    { id: 4 as const, label: "Review and publish", detail: `${coverage.counts.reportable} rent values` },
  ];

  return <>
    <section aria-label="Client edition progress" className="mt-8 overflow-hidden rounded-2xl border border-grid bg-white shadow-sm">
      <div className="grid gap-px bg-grid sm:grid-cols-2 xl:grid-cols-4">{steps.map((step) => <button key={step.id} type="button" onClick={() => setActiveStep(step.id)} className={`bg-white p-5 text-left transition ${activeStep === step.id ? "shadow-[inset_0_-3px_0_#1b6e8c]" : "hover:bg-slate-50"}`}><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${activeStep === step.id ? "bg-navy text-white" : activeStep > step.id ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{activeStep > step.id ? "✓" : step.id}</span><p className="mt-3 text-sm font-semibold text-navy">{step.label}</p><p className="mt-1 truncate text-xs text-muted-foreground">{step.detail}</p></button>)}</div>
    </section>
    <section className="mt-8 grid gap-7 xl:grid-cols-[390px_1fr]">
      <form action={publishMarketIqReport} className="h-fit rounded-xl border border-grid bg-white p-5 shadow-sm">
        {draftId && <input type="hidden" name="draftId" value={draftId} />}
        {launchFlow && <input type="hidden" name="flow" value="launch" />}
        <input type="hidden" name="findingSelectionApplied" value="1" />
        {selectedFindings.map((finding) => <input key={finding.id} type="hidden" name="findingIds" value={finding.id} />)}

        <div className={activeStep === 1 ? "" : "hidden"}>
          <p className="dq-eyebrow">Step 1 of 4</p><h2 className="dq-h2">Choose the evidence</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Start with your saved {snapshot.scope.marketName} scope, then remove anything that does not belong in this client conversation.</p>
          <div className="mt-5 grid gap-5">
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Market<select name="marketId" defaultValue={snapshot.scope.marketId} className="mt-2 w-full rounded-md border border-grid bg-surface-soft px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-navy"><option value={snapshot.scope.marketId}>{snapshot.scope.marketName}</option></select></label>
            <fieldset><div className="flex items-center justify-between gap-3"><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Cities</legend><button type="button" onClick={() => setSelection((current) => ({ ...current, cities: current.cities.length === scopeOptions.cities.length ? [] : [...scopeOptions.cities] }))} className="text-xs font-semibold text-teal-700">{selection.cities.length === scopeOptions.cities.length ? "Clear" : "Select all"}</button></div><div className="mt-2 grid gap-2">{scopeOptions.cities.map((city) => <ScopeOption key={city} name="cities" value={city} label={city} checked={selection.cities.includes(city)} onChange={() => setSelection((current) => ({ ...current, cities: toggleValue(current.cities, city) }))} />)}</div></fieldset>
            <fieldset><div className="flex items-center justify-between gap-3"><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">ZIP codes</legend><button type="button" onClick={() => setSelection((current) => ({ ...current, zipCodes: current.zipCodes.length === scopeOptions.zipCodes.length ? [] : [...scopeOptions.zipCodes] }))} className="text-xs font-semibold text-teal-700">{selection.zipCodes.length === scopeOptions.zipCodes.length ? "Clear" : "Select all"}</button></div><p className="mt-1 text-xs text-muted-foreground">{selection.zipCodes.length} of {scopeOptions.zipCodes.length} selected</p><div className="mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-grid p-2">{scopeOptions.zipCodes.map((zip) => <ScopeOption key={zip} name="zipCodes" value={zip} label={zip} checked={selection.zipCodes.includes(zip)} onChange={() => setSelection((current) => ({ ...current, zipCodes: toggleValue(current.zipCodes, zip) }))} />)}</div></fieldset>
            <fieldset><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Product segments</legend><div className="mt-2 grid gap-2">{scopeOptions.segments.map((segment) => <ScopeOption key={segment.key} name="segments" value={segment.key} label={segment.label} checked={selection.segments.includes(segment.key)} onChange={() => setSelection((current) => ({ ...current, segments: toggleValue(current.segments, segment.key as MarketIqSegmentKey) }))} />)}</div></fieldset>
            <fieldset className="border-t border-grid pt-5"><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Changes since the prior edition</legend>{editionComparison.findings.length ? <div className="mt-3 grid gap-2">{editionComparison.findings.map((finding) => <label key={finding.id} className={`cursor-pointer rounded-lg border p-3 ${excludedFindingIds.includes(finding.id) ? "border-grid bg-white opacity-60" : "border-teal-200 bg-teal-50"}`}><div className="flex gap-3"><input type="checkbox" checked={!excludedFindingIds.includes(finding.id)} onChange={() => toggleFinding(finding.id)} className="mt-0.5 h-4 w-4 accent-teal-700" /><span><span className="block text-sm font-semibold leading-5 text-navy">{finding.headline}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{finding.detail}</span></span></div></label>)}</div> : <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-muted-foreground">This is the baseline edition. The next edition will identify material changes against it.</p>}</fieldset>
            <button type="button" onClick={() => setActiveStep(2)} disabled={!hasGeography || !selection.segments.length} className="rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Continue to your perspective</button>
          </div>
        </div>

        <div className={activeStep === 2 ? "" : "hidden"}>
          <p className="dq-eyebrow">Step 2 of 4</p><h2 className="dq-h2">Add your perspective</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The market read works without commentary. Add a concise point of view when it helps your client understand why the data matters.</p>
          <div className="mt-5 grid gap-5">
            <label className="text-sm font-semibold text-navy">Intended audience<select name="audienceKind" value={audienceKind} onChange={(event) => selectAudience(event.target.value as "client" | "prospect")} className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2.5 text-sm font-normal"><option value="client">Current clients</option><option value="prospect">Prospective clients</option></select><span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">This determines which saved recipients are available after publication.</span></label>
            <label className="text-sm font-semibold text-navy">Report headline, optional<input name="editorialHeadline" maxLength={120} value={editorialHeadline} onChange={(event) => setEditorialHeadline(event.target.value)} placeholder="A split rental market requires a local read" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /><span className="mt-1 block text-right text-[10px] font-normal text-muted-foreground">{editorialHeadline.length}/120</span></label>
            <label className="text-sm font-semibold text-navy">Message from your firm, optional<textarea name="editorialIntroduction" maxLength={700} rows={8} value={editorialIntroduction} onChange={(event) => setEditorialIntroduction(event.target.value)} placeholder="Explain what changed and what you think clients should consider." className="mt-2 w-full resize-y rounded-md border border-grid px-3 py-2.5 text-sm font-normal leading-6" /><span className="mt-1 block text-right text-[10px] font-normal text-muted-foreground">{editorialIntroduction.length}/700</span></label>
            <div className="flex gap-3"><button type="button" onClick={() => setActiveStep(1)} className="flex-1 rounded-md border border-grid px-4 py-3 text-sm font-semibold text-navy">Back</button><button type="button" onClick={() => setActiveStep(3)} className="flex-1 rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Continue</button></div>
          </div>
        </div>

        <div className={activeStep === 3 ? "" : "hidden"}>
          <p className="dq-eyebrow">Step 3 of 4</p><h2 className="dq-h2">Confirm your firm</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">These details appear on the client page. Company marketing remains optional and subordinate to the market read.</p>
          <div className="mt-5 grid gap-5">
            <label className="text-sm font-semibold text-navy">Firm name<input name="displayName" required minLength={2} maxLength={120} value={brand.displayName} onChange={(event) => updateBrand("displayName", event.target.value)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Logo URL, optional<input name="logoUrl" type="url" maxLength={500} value={brand.logoUrl ?? ""} onChange={(event) => updateBrand("logoUrl", event.target.value || null)} placeholder="https://yourfirm.com/logo.png" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-navy">Primary color<input name="primaryColor" type="color" value={brand.primaryColor} onChange={(event) => updateBrand("primaryColor", event.target.value)} className="mt-2 h-11 w-full rounded-md border border-grid bg-white p-1" /></label><label className="text-sm font-semibold text-navy">Accent color<input name="accentColor" type="color" value={brand.accentColor} onChange={(event) => updateBrand("accentColor", event.target.value)} className="mt-2 h-11 w-full rounded-md border border-grid bg-white p-1" /></label></div>
            <label className="text-sm font-semibold text-navy">Contact name<input name="contactName" maxLength={120} value={brand.contactName ?? ""} onChange={(event) => updateBrand("contactName", event.target.value || null)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Contact email<input name="contactEmail" type="email" maxLength={254} value={brand.contactEmail ?? ""} onChange={(event) => updateBrand("contactEmail", event.target.value || null)} className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Website<input name="websiteUrl" type="url" maxLength={500} value={brand.websiteUrl ?? ""} onChange={(event) => updateBrand("websiteUrl", event.target.value || null)} placeholder="https://yourfirm.com" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <div className="border-t border-grid pt-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Optional company profile</p><p className="mt-2 text-xs leading-5 text-muted-foreground">If supplied, this appears near the end of the report and email.</p></div>
            <label className="text-sm font-semibold text-navy">About your company<textarea name="companyProfile" maxLength={700} rows={5} value={companyProfile} onChange={(event) => setCompanyProfile(event.target.value)} placeholder="Who you serve, where you operate, and how you help owners." className="mt-2 w-full resize-y rounded-md border border-grid px-3 py-2.5 text-sm font-normal leading-6" /><span className="mt-1 block text-right text-[10px] font-normal text-muted-foreground">{companyProfile.length}/700</span></label>
            <label className="text-sm font-semibold text-navy">Call-to-action label<input name="companyCtaLabel" maxLength={60} value={companyCtaLabel} onChange={(event) => setCompanyCtaLabel(event.target.value)} placeholder="Talk with our team" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Call-to-action URL<input name="companyCtaUrl" type="url" maxLength={500} value={companyCtaUrl} onChange={(event) => setCompanyCtaUrl(event.target.value)} placeholder="https://yourfirm.com/contact" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <div className="flex gap-3"><button type="button" onClick={() => setActiveStep(2)} className="flex-1 rounded-md border border-grid px-4 py-3 text-sm font-semibold text-navy">Back</button><button type="button" onClick={() => setActiveStep(4)} disabled={brand.displayName.trim().length < 2} className="flex-1 rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-300">Review</button></div>
          </div>
        </div>

        <div className={activeStep === 4 ? "" : "hidden"}>
          <p className="dq-eyebrow">Step 4 of 4</p><h2 className="dq-h2">Review and publish</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Publication freezes the evidence, wording, and branding into a permanent, revocable client link.</p>
          <dl className="mt-5 divide-y divide-grid rounded-xl border border-grid bg-slate-50 px-4"><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Audience</dt><dd className="mt-1 text-sm font-semibold text-navy">{audienceKind === "client" ? "Current clients" : "Prospective clients"}</dd></div><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Evidence</dt><dd className="mt-1 text-sm font-semibold text-navy">{selection.cities.length} cities · {selection.zipCodes.length} ZIPs · {selection.segments.length} segments</dd></div><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Published values</dt><dd className="mt-1 text-sm font-semibold text-navy">{coverage.counts.reportable} current rent values</dd></div><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Change findings</dt><dd className="mt-1 text-sm font-semibold text-navy">{selectedFindings.length} included</dd></div><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prepared by</dt><dd className="mt-1 text-sm font-semibold text-navy">{brand.displayName}</dd></div></dl>
          <a href="#client-preview" className="mt-5 block rounded-md border border-grid px-4 py-3 text-center text-sm font-semibold text-navy">Review the exact client page</a>
          <button disabled={!canPublish} className="mt-3 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-slate-300">Publish client edition</button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Publishing creates the client link and a draft distribution campaign. It never sends email.</p>
          {!canPublish && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">Select at least one geography and segment with a current Trends value before publishing.</p>}
          <button type="button" onClick={() => setActiveStep(3)} className="mt-3 w-full px-4 py-2 text-sm font-semibold text-teal-700">Back to firm details</button>
        </div>
      </form>

      <section className="rounded-xl border border-grid bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="dq-eyebrow">Pre-publication check</p><h2 className="dq-h2">What the client will and will not see</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Every selected geography and segment is checked against the latest Trends IQ month. Every available Trends IQ value publishes; stale and missing cells remain visible here without a rent value.</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${source === "dwellsy_trends" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{source === "dwellsy_trends" ? "Live Dwellsy Trends" : "Verified preview seed"}</span></div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"><CoverageSummary status="reportable" count={coverage.counts.reportable} /><CoverageSummary status="stale" count={coverage.counts.stale} /><CoverageSummary status="unavailable" count={coverage.counts.unavailable} /></div>
        <div className="mt-7 rounded-xl border border-teal-200 bg-teal-50/60 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-700">Included changes</p><h3 className="mt-2 text-lg font-semibold text-navy">{editionComparison.heading}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{selectedFindings.length === editionComparison.findings.length ? editionComparison.narrative : `${selectedFindings.length} of ${editionComparison.findings.length} material changes are included in the client edition.`}</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-800 ring-1 ring-teal-200">{editionComparison.state}</span></div>{selectedFindings.length > 0 && <div className="mt-4 grid gap-3 lg:grid-cols-2">{selectedFindings.map((finding) => <article key={finding.id} className="rounded-lg border border-teal-100 bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.11em] text-teal-700">{finding.importance} priority</span><span className="text-[10px] uppercase text-muted-foreground">{finding.geographyType}</span></div><p className="mt-2 text-sm font-semibold leading-5 text-navy">{finding.headline}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{finding.detail}</p></article>)}</div>}</div>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">{groupedCoverage.map(([geography, cells]) => <article key={geography} className="rounded-xl border border-grid p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-navy">{geography}</h3><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{cells[0]?.geographyType}</span></div><div className="mt-3 grid gap-2">{cells.map((cell) => <div key={cell.key} title={cell.reason} className="flex items-center justify-between gap-3 rounded-lg bg-surface-soft px-3 py-2"><div><p className="text-xs font-semibold text-navy">{cell.segmentLabel}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{cell.reason}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase ring-1 ${STATUS_STYLE[cell.status]}`}>{cell.status}</span></div>)}</div></article>)}</div>
      </section>
    </section>

    <section id="client-preview" className="mt-10 scroll-mt-28 overflow-hidden rounded-2xl border border-grid bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-grid bg-white px-6 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Client preview</p><p className="mt-1 text-sm text-muted-foreground">This is how the published report will appear.</p></div><span className="rounded-full bg-surface-soft px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{coverage.counts.reportable} rent cells will publish</span></div>
      <MarketIqPublicReport report={reviewedSnapshot} preview />
    </section>
  </>;
}
