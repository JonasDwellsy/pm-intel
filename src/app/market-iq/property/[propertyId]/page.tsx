import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";

import { MarketIqPropertyActivityView } from "@/components/market-iq/report/MarketIqPropertyActivityView";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { resolveActiveMarketIqMarket } from "@/lib/market-iq/markets/selection";
import { marketIqPropertyActivityPath } from "@/lib/market-iq/property-activity";
import { loadMarketIqPropertyActivityView } from "@/lib/market-iq/property-activity.server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: { absolute: "Property Activity | Market IQ | Dwellsy IQ" },
};

export default async function MarketIqPropertyActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ market?: string }>;
}) {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ propertyId }, query, { organizationId }] = await Promise.all([params, searchParams, getActiveOrgContext()]);
  if (!/^\d{1,20}$/.test(propertyId)) notFound();
  if (!organizationId) {
    const returnTo = marketIqPropertyActivityPath(query.market ?? "", propertyId);
    redirect(`/setup-workspace?from=${encodeURIComponent(returnTo)}`);
  }

  const access = await resolveViewerMarketIqAccess();
  if (!access.hasProduct) redirect("/market-iq/subscribe");
  const preference = await prisma.marketIqWorkspacePreference.findUnique({
    where: { organizationId },
    select: { onboardingCompletedAt: true, defaultMarketId: true },
  });
  const activeMarket = resolveActiveMarketIqMarket({
    requestedMarketId: query.market,
    preferredMarketId: preference?.defaultMarketId,
    entitlement: access.entitlement,
  });
  if (!activeMarket) redirect("/market-iq/subscribe");
  if (access.source === "subscription" && !preference?.onboardingCompletedAt) {
    const returnTo = marketIqPropertyActivityPath(activeMarket.id, propertyId);
    redirect(`/market-iq/get-started?market=${encodeURIComponent(activeMarket.id)}&returnTo=${encodeURIComponent(returnTo)}`);
  }
  if (activeMarket.status !== "live") notFound();

  const view = await loadMarketIqPropertyActivityView({
    marketId: activeMarket.id,
    propertyId,
    timeZone: activeMarket.timeZone,
  });
  if (!view) notFound();

  return <main style={{ "--report-primary": "#17324a", "--report-accent": "#c16f36" } as CSSProperties} className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <MarketIqPropertyActivityView view={view} marketId={activeMarket.id} marketName={activeMarket.shortLabel} timeZone={activeMarket.timeZone} />
  </main>;
}
