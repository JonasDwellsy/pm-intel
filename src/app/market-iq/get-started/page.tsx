import { notFound, redirect } from "next/navigation";
import { DwellsyIqWorkspaceNav } from "@/components/dwellsy-iq/DwellsyIqWorkspaceNav";
import { MarketIqActivationFlow } from "@/components/market-iq/activation/MarketIqActivationFlow";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { buildClevelandComposerPreview, defaultMarketIqReportBrand } from "@/lib/market-iq/report/composer.server";
import { marketIqSelectionFromPreference } from "@/lib/market-iq/workspace-preference";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MarketIqGetStartedPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([getActiveOrgContext(), resolveViewerMarketIqAccess()]);
  if (!userId) notFound();
  if (!organizationId) redirect("/setup-workspace");
  if (!access.hasProduct || !isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID)) redirect("/market-iq/subscribe");
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, brandProfile: true, marketIqWorkspacePreference: true } });
  if (!organization) redirect("/setup-workspace");
  const brand = organization.brandProfile ?? defaultMarketIqReportBrand(organization.name);
  const preview = await buildClevelandComposerPreview(brand);
  return <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <DwellsyIqWorkspaceNav />
    <header className="mt-6 max-w-4xl"><p className="dq-eyebrow">Market IQ activation</p><h1 className="dq-h1">Set up your client-ready market read</h1><p className="mt-4 text-lg leading-8 text-slate-600">A few choices now will make every future advisory faster. No portfolio upload, implementation call, or Dwellsy branding on the client-facing report is required.</p></header>
    <MarketIqActivationFlow snapshot={preview.snapshot} initialBrand={brand} initialSelection={marketIqSelectionFromPreference(organization.marketIqWorkspacePreference)} />
  </main>;
}
