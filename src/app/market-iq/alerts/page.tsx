import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { bulkUpdateMarketIqAlerts } from "@/app/market-iq/alerts/actions";
import { addMarketIqDailyMatchNote, markMarketIqDailyMatchesRead, updateMarketIqDailyMatchTriage } from "@/app/market-iq/daily/actions";
import { MarketIqAlertWorkbench } from "@/components/market-iq/MarketIqAlertWorkbench";
import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { loadMarketIqAlertWorkbench } from "@/lib/market-iq/daily-alert-workbench.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Alert Workbench | Market IQ | Dwellsy IQ" },
};

export default async function MarketIqAlertsPage() {
  if (!marketIqPreviewEnabled()) notFound();
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!organizationId) redirect(`/setup-workspace?from=${encodeURIComponent("/market-iq/alerts")}`);
  if (!userId || !access.hasProduct) redirect("/market-iq/subscribe");

  const preference = await prisma.marketIqWorkspacePreference.findUnique({
    where: { organizationId },
    select: { onboardingCompletedAt: true },
  });
  if (access.source === "subscription" && !preference?.onboardingCompletedAt) {
    redirect(`/market-iq/get-started?returnTo=${encodeURIComponent("/market-iq/alerts")}`);
  }

  const state = await loadMarketIqAlertWorkbench({
    organizationId,
    userId,
    marketIds: listEntitledMarketIqMarkets(access.entitlement).map((market) => market.id),
  });
  return <main className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
    <MarketIqAlertWorkbench
      state={state}
      bulkUpdate={bulkUpdateMarketIqAlerts}
      markRead={markMarketIqDailyMatchesRead}
      updateTriage={updateMarketIqDailyMatchTriage}
      addNote={addMarketIqDailyMatchNote}
    />
  </main>;
}
