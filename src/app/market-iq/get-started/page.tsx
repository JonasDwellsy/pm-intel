import { notFound, redirect } from "next/navigation";
import { MarketIqActivationFlow } from "@/components/market-iq/activation/MarketIqActivationFlow";
import { MarketIqLaunchJourney } from "@/components/market-iq/launch/MarketIqLaunchJourney";
import { MarketIqMarketSelector } from "@/components/market-iq/MarketIqMarketSelector";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { MARKET_IQ_APPLICATION_PATH, safeMarketIqReturnTo } from "@/lib/market-iq/entry";
import { defaultMarketIqReportBrand, EMPTY_MARKET_IQ_EDITORIAL_DEFAULTS } from "@/lib/market-iq/report/composer.server";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";
import { buildMarketIqSetupFallbackSnapshot } from "@/lib/market-iq/report/setup-fallback.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqGetStartedPage({ searchParams }: { searchParams: Promise<{ saved?: string; step?: string; flow?: string; market?: string; returnTo?: string }> }) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  const query = await searchParams;
  const returnTo = query.returnTo
    ? safeMarketIqReturnTo(query.returnTo, MARKET_IQ_APPLICATION_PATH)
    : null;
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, brandProfile: true, marketIqWorkspacePreference: true, marketIqMarketPreferences: true } });
  if (!organization) redirect("/setup-workspace");
  const activeMarket = resolveActiveMarketIqMarket({ requestedMarketId: query.market, preferredMarketId: organization.marketIqWorkspacePreference?.defaultMarketId, entitlement: access.entitlement });
  if (!activeMarket || !isMarketEntitled(access.entitlement, activeMarket.id)) redirect("/market-iq/subscribe");
  const entitledMarkets = listEntitledMarketIqMarkets(access.entitlement);
  const brand = organization.brandProfile ?? defaultMarketIqReportBrand(organization.name);
  const editorialDefaults = organization.brandProfile ? {
    defaultClientMessage: organization.brandProfile.defaultClientMessage,
    defaultProspectMessage: organization.brandProfile.defaultProspectMessage,
    companyProfile: organization.brandProfile.companyProfile,
    companyCtaLabel: organization.brandProfile.companyCtaLabel,
    companyCtaUrl: organization.brandProfile.companyCtaUrl,
  } : EMPTY_MARKET_IQ_EDITORIAL_DEFAULTS;
  // Setup needs the market's valid cities, ZIPs, and product segments, not a
  // live analytical read. Keeping that catalog local prevents a slow or cold
  // read-only Trends connection from blocking brand and scope configuration.
  const preview = {
    snapshot: buildMarketIqSetupFallbackSnapshot(activeMarket.id, brand),
    source: "scope_catalog" as const,
  };
  const requestedStep = Number(query.step ?? "1");
  const initialStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 3 ? requestedStep : 1;
  const completed = Boolean(organization.marketIqWorkspacePreference?.onboardingCompletedAt);
  const marketPreference = organization.marketIqMarketPreferences.find((preference) => preference.marketId === activeMarket.id) ?? null;
  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    {query.flow === "launch" && <MarketIqLaunchJourney current="setup" />}
    <div className="mt-5"><MarketIqMarketSelector markets={entitledMarkets} activeMarketId={activeMarket.id} basePath="/market-iq/get-started" /></div>
    <header className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end"><div><p className="dq-eyebrow">Market IQ setup</p><h1 className="dq-h1">{access.capabilities.publishClientReports ? `Set up your ${activeMarket.shortLabel} client read` : `Set up ${activeMarket.shortLabel} market intelligence`}</h1><p className="mt-4 max-w-4xl text-lg leading-8 text-slate-600">{access.capabilities.publishClientReports ? `Choose the ${activeMarket.shortLabel} coverage, report branding, and default message your firm wants to use. You can revise each edition before it is shared.` : `Choose the ${activeMarket.shortLabel} geographies and rental segments your team wants to follow. Client-facing reports can be added later without changing these market settings.`}</p></div><aside className={`rounded-xl border p-5 ${marketPreference?.configuredAt ? "border-emerald-200 bg-emerald-50" : "border-teal-200 bg-teal-50"}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-800">Market status</p><p className="mt-2 text-lg font-semibold text-navy">{marketPreference?.configuredAt ? "Configured and editable" : marketPreference ? "Draft saved" : "Not configured"}</p><p className="mt-2 text-sm leading-6 text-slate-600">Settings apply only to {activeMarket.shortLabel}. Existing published reports do not change.</p></aside></header>
    {query.saved === "1" && <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">Progress saved. You can safely leave this page and return later.</p>}
    <MarketIqActivationFlow marketId={activeMarket.id} marketLabel={activeMarket.shortLabel} snapshot={preview.snapshot} initialBrand={brand} initialEditorialDefaults={editorialDefaults} initialSelection={marketIqSelectionFromPreference(marketPreference ?? (organization.marketIqWorkspacePreference?.defaultMarketId === activeMarket.id ? organization.marketIqWorkspacePreference : null), preview.snapshot)} initialStep={access.capabilities.publishClientReports ? initialStep : initialStep === 3 ? 3 : 2} source={preview.source} completed={completed} clientAdvisoryEnabled={access.capabilities.publishClientReports} logoStorageEnabled={Boolean(process.env.MARKET_IQ_BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim())} returnTo={returnTo} />
  </main>;
}
