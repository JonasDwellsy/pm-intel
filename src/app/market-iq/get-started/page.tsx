import { notFound, redirect } from "next/navigation";
import { MarketIqActivationFlow } from "@/components/market-iq/activation/MarketIqActivationFlow";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { buildClevelandComposerPreview, defaultMarketIqReportBrand, EMPTY_MARKET_IQ_EDITORIAL_DEFAULTS } from "@/lib/market-iq/report/composer.server";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqGetStartedPage({ searchParams }: { searchParams: Promise<{ saved?: string; step?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, brandProfile: true, marketIqWorkspacePreference: true } });
  if (!organization) redirect("/setup-workspace");
  const brand = organization.brandProfile ?? defaultMarketIqReportBrand(organization.name);
  const editorialDefaults = organization.brandProfile ? {
    defaultClientMessage: organization.brandProfile.defaultClientMessage,
    defaultProspectMessage: organization.brandProfile.defaultProspectMessage,
    companyProfile: organization.brandProfile.companyProfile,
    companyCtaLabel: organization.brandProfile.companyCtaLabel,
    companyCtaUrl: organization.brandProfile.companyCtaUrl,
  } : EMPTY_MARKET_IQ_EDITORIAL_DEFAULTS;
  const preview = await buildClevelandComposerPreview(brand);
  const query = await searchParams;
  const requestedStep = Number(query.step ?? "1");
  const initialStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 3 ? requestedStep : 1;
  const completed = Boolean(organization.marketIqWorkspacePreference?.onboardingCompletedAt);
  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <header className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end"><div><p className="dq-eyebrow">Market IQ setup</p><h1 className="dq-h1">{access.capabilities.publishClientReports ? "Set up your client-ready market read" : "Set up your market intelligence workspace"}</h1><p className="mt-4 max-w-4xl text-lg leading-8 text-slate-600">{access.capabilities.publishClientReports ? "Choose the Cleveland coverage, report branding, and default message your firm wants to use. You can revise each edition before it is shared." : "Choose the Cleveland geographies and rental segments your team wants to follow. Client-facing reports can be added later without changing these market settings."}</p></div><aside className={`rounded-xl border p-5 ${completed ? "border-emerald-200 bg-emerald-50" : "border-teal-200 bg-teal-50"}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Setup status</p><p className="mt-2 text-lg font-semibold text-navy">{completed ? "Active and editable" : organization.brandProfile ? "Draft saved" : "About three minutes"}</p><p className="mt-2 text-sm leading-6 text-slate-600">{completed ? "Changes apply to future reports. Existing published editions do not change." : "Progress is saved between steps, so you can leave and resume later."}</p></aside></header>
    {query.saved === "1" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Progress saved. You can safely leave this page and return later.</p>}
    <MarketIqActivationFlow snapshot={preview.snapshot} initialBrand={brand} initialEditorialDefaults={editorialDefaults} initialSelection={marketIqSelectionFromPreference(organization.marketIqWorkspacePreference)} initialStep={access.capabilities.publishClientReports ? initialStep : initialStep === 3 ? 3 : 2} source={preview.source} completed={completed} clientAdvisoryEnabled={access.capabilities.publishClientReports} />
  </main>;
}
