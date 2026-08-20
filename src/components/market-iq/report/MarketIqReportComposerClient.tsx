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
  type MarketIqReportScopeSelection,
} from "@/lib/market-iq/report/scope";

type Brand = MarketIqReportSnapshot["brand"];
type DeliveryMode = "autopilot" | "review";

function ChoiceCard({ active, title, description, badge, onClick }: {
  active: boolean;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  return <button type="button" onClick={onClick} className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-teal-500 bg-teal-50 ring-1 ring-teal-200" : "border-grid bg-white hover:border-slate-400"}`}>
    <span className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-navy">{title}</span>{badge && <span className="rounded-full bg-navy px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white">{badge}</span>}</span>
    <span className="mt-2 block text-xs leading-5 text-muted-foreground">{description}</span>
  </button>;
}

export function MarketIqReportComposerClient({ snapshot, initialBrand, initialEditorialDefaults, initialSelection, source, priorEdition, initialDeliveryMode = "review", draftId = null, launchFlow = false }: {
  snapshot: MarketIqReportSnapshot;
  initialBrand: Brand;
  initialEditorialDefaults: MarketIqEditorialDefaults;
  initialSelection: MarketIqReportScopeSelection;
  source: "dwellsy_trends";
  priorEdition: PriorMarketIqEdition | null;
  initialDeliveryMode?: DeliveryMode;
  draftId?: string | null;
  launchFlow?: boolean;
}) {
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(initialDeliveryMode);
  const initialAudienceKind = snapshot.editorial?.audienceKind ?? "client";
  const selection = initialSelection;
  const brand = initialBrand;
  const [audienceKind, setAudienceKind] = useState<"client" | "prospect">(initialAudienceKind);
  const [editorialHeadline, setEditorialHeadline] = useState(snapshot.editorial?.headline ?? "");
  const [editorialIntroduction, setEditorialIntroduction] = useState(snapshot.editorial?.introduction ?? (initialAudienceKind === "prospect" ? initialEditorialDefaults.defaultProspectMessage : initialEditorialDefaults.defaultClientMessage) ?? "");
  const companyProfile = snapshot.editorial?.companyProfile ?? initialEditorialDefaults.companyProfile ?? "";
  const companyCtaLabel = snapshot.editorial?.companyCtaLabel ?? initialEditorialDefaults.companyCtaLabel ?? "";
  const companyCtaUrl = snapshot.editorial?.companyCtaUrl ?? initialEditorialDefaults.companyCtaUrl ?? "";
  const [excludedFindingIds, setExcludedFindingIds] = useState<string[]>([]);
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
  const exceptionCoverage = coverage.cells.filter((cell) => cell.status !== "reportable");
  const hasGeography = selection.cities.length + selection.zipCodes.length > 0;
  const canPublish = coverage.canPublish && hasGeography && selection.segments.length > 0;

  function selectAudience(next: "client" | "prospect") {
    setAudienceKind(next);
    setEditorialIntroduction(next === "client" ? initialEditorialDefaults.defaultClientMessage ?? "" : initialEditorialDefaults.defaultProspectMessage ?? "");
  }

  function toggleFinding(id: string) {
    setExcludedFindingIds((current) => current.includes(id) ? current.filter((findingId) => findingId !== id) : [...current, id]);
  }

  return <>
    <section className="mt-8 grid gap-7 xl:grid-cols-[400px_minmax(0,1fr)] xl:items-start">
      <form action={publishMarketIqReport} className="h-fit rounded-2xl border border-grid bg-white p-5 shadow-sm">
        {draftId && <input type="hidden" name="draftId" value={draftId} />}
        {launchFlow && <input type="hidden" name="flow" value="launch" />}
        <input type="hidden" name="marketId" value={snapshot.scope.marketId} />
        <input type="hidden" name="deliveryMode" value={deliveryMode} />
        {selection.cities.map((city) => <input key={`city-${city}`} type="hidden" name="cities" value={city} />)}
        {selection.zipCodes.map((zip) => <input key={`zip-${zip}`} type="hidden" name="zipCodes" value={zip} />)}
        {selection.segments.map((segment) => <input key={`segment-${segment}`} type="hidden" name="segments" value={segment} />)}
        <input type="hidden" name="displayName" value={brand.displayName} />
        <input type="hidden" name="logoUrl" value={brand.logoUrl ?? ""} />
        <input type="hidden" name="primaryColor" value={brand.primaryColor} />
        <input type="hidden" name="accentColor" value={brand.accentColor} />
        <input type="hidden" name="contactName" value={brand.contactName ?? ""} />
        <input type="hidden" name="contactEmail" value={brand.contactEmail ?? ""} />
        <input type="hidden" name="contactPhone" value={brand.contactPhone ?? ""} />
        <input type="hidden" name="websiteUrl" value={brand.websiteUrl ?? ""} />
        <input type="hidden" name="companyProfile" value={companyProfile} />
        <input type="hidden" name="companyCtaLabel" value={companyCtaLabel} />
        <input type="hidden" name="companyCtaUrl" value={companyCtaUrl} />
        <input type="hidden" name="findingSelectionApplied" value="1" />
        {selectedFindings.map((finding) => <input key={finding.id} type="hidden" name="findingIds" value={finding.id} />)}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
          <button type="button" onClick={() => setActiveStep(1)} className={`rounded-lg px-3 py-2.5 text-xs font-semibold ${activeStep === 1 ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}>1. Delivery and message</button>
          <button type="button" onClick={() => setActiveStep(2)} className={`rounded-lg px-3 py-2.5 text-xs font-semibold ${activeStep === 2 ? "bg-white text-navy shadow-sm" : "text-slate-500"}`}>2. Publish</button>
        </div>

        <div className={activeStep === 1 ? "" : "hidden"}>
          <p className="dq-eyebrow">Delivery</p>
          <h2 className="dq-h2">How should future editions run?</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose a monthly hands-off workflow or keep approval in your hands. You can change this later.</p>
          <div className="mt-5 grid gap-3">
            <ChoiceCard active={deliveryMode === "autopilot"} title="Monthly autopilot" badge="Recommended" description="Prepare and deliver each monthly edition to recipients you have approved for recurring delivery. Pause or review any time." onClick={() => setDeliveryMode("autopilot")} />
            <ChoiceCard active={deliveryMode === "review"} title="Review each edition" description="Prepare a private monthly draft and wait for your approval before publishing or sending it." onClick={() => setDeliveryMode("review")} />
          </div>

          <div className="mt-7 border-t border-grid pt-6">
            <p className="dq-eyebrow">Optional commentary</p>
            <h2 className="dq-h2">Add your perspective</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The report works without commentary. Add a short note only when it helps the reader.</p>
          </div>
          <div className="mt-5 grid gap-5">
            <div className="rounded-xl border border-grid bg-surface-soft p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Report scope</p><p className="mt-2 text-sm font-semibold text-navy">{selection.cities.length} cities, {selection.zipCodes.length} ZIPs, {selection.segments.length} segments</p></div><a href={`/market-iq/get-started?market=${encodeURIComponent(snapshot.scope.marketId)}&step=2`} className="shrink-0 text-xs font-semibold text-teal-700">Change</a></div></div>
            <label className="text-sm font-semibold text-navy">Audience<select name="audienceKind" value={audienceKind} onChange={(event) => selectAudience(event.target.value as "client" | "prospect")} className="mt-2 w-full rounded-md border border-grid bg-white px-3 py-2.5 text-sm font-normal"><option value="client">Current clients</option><option value="prospect">Prospective clients</option></select></label>
            <label className="text-sm font-semibold text-navy">Headline, optional<input name="editorialHeadline" maxLength={120} value={editorialHeadline} onChange={(event) => setEditorialHeadline(event.target.value)} placeholder="A local read on this month's rental market" className="mt-2 w-full rounded-md border border-grid px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-sm font-semibold text-navy">Message from your firm, optional<textarea name="editorialIntroduction" maxLength={700} rows={6} value={editorialIntroduction} onChange={(event) => setEditorialIntroduction(event.target.value)} placeholder="Add the context you want clients to hear from you." className="mt-2 w-full resize-y rounded-md border border-grid px-3 py-2.5 text-sm font-normal leading-6" /></label>
            {editionComparison.findings.length > 0 && <fieldset className="border-t border-grid pt-5"><legend className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Changes since the prior edition</legend><div className="mt-3 grid gap-2">{editionComparison.findings.map((finding) => <label key={finding.id} className={`cursor-pointer rounded-lg border p-3 ${excludedFindingIds.includes(finding.id) ? "border-grid bg-white opacity-60" : "border-teal-200 bg-teal-50"}`}><div className="flex gap-3"><input type="checkbox" checked={!excludedFindingIds.includes(finding.id)} onChange={() => toggleFinding(finding.id)} className="mt-0.5 h-4 w-4 accent-teal-700" /><span><span className="block text-sm font-semibold leading-5 text-navy">{finding.headline}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{finding.detail}</span></span></div></label>)}</div></fieldset>}
            <button type="button" onClick={() => setActiveStep(2)} className="w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">Continue to publish</button>
          </div>
        </div>

        <div className={activeStep === 2 ? "" : "hidden"}>
          <p className="dq-eyebrow">Final check</p>
          <h2 className="dq-h2">Publish this edition</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">The client preview is beside this panel. Publishing creates a revocable link and does not send email from this page.</p>
          <div className="mt-5 rounded-xl border border-grid bg-slate-50 p-4">
            <p className="text-sm font-semibold text-navy">{coverage.counts.reportable} current Trends readings are available across the selected scope.</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Combinations without a current published value are omitted from the client report. They are not estimates and do not create blank sections.</p>
            {exceptionCoverage.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-teal-700">About omitted combinations</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">{exceptionCoverage.length} selected geography and segment combinations do not have a current published value. This count is an internal coverage check, not part of the client report.</p></details>}
          </div>
          <dl className="mt-5 divide-y divide-grid rounded-xl border border-grid px-4"><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Future workflow</dt><dd className="mt-1 text-sm font-semibold text-navy">{deliveryMode === "autopilot" ? "Monthly autopilot" : "Review each edition"}</dd></div><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Audience</dt><dd className="mt-1 text-sm font-semibold text-navy">{audienceKind === "client" ? "Current clients" : "Prospective clients"}</dd></div><div className="py-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prepared by</dt><dd className="mt-1 text-sm font-semibold text-navy">{brand.displayName}</dd></div></dl>
          <button disabled={!canPublish} className="mt-5 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-slate-300">Publish client edition</button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Autopilot applies only to recipients you explicitly approve for recurring delivery. No recipient is enrolled from this page.</p>
          {!canPublish && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">Select at least one geography and segment with a current Trends value before publishing.</p>}
          <button type="button" onClick={() => setActiveStep(1)} className="mt-3 w-full px-4 py-2 text-sm font-semibold text-teal-700">Back</button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-grid bg-white shadow-sm xl:sticky xl:top-24">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-grid px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Live client preview</p><p className="mt-1 text-xs text-muted-foreground">Updates as you edit. Scroll inside the preview to inspect the full report.</p></div><span className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${source === "dwellsy_trends" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{source === "dwellsy_trends" ? "Current Trends data" : "Preview data"}</span></div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto bg-[#f7f6f2]">
          <div className="origin-top scale-[0.82] sm:scale-90 xl:scale-100"><MarketIqPublicReport report={reviewedSnapshot} preview /></div>
        </div>
      </section>
    </section>
  </>;
}
