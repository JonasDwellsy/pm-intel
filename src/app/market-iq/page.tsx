import { notFound } from "next/navigation";
import { ClevelandPilot } from "@/components/market-iq/ClevelandPilot";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export const dynamic = "force-dynamic";

export default async function MarketIqPage() {
  // The flag check intentionally happens before Clerk or Prisma. When the
  // preview is disabled, the route is indistinguishable from a missing page
  // and cannot add database load to the existing Operator IQ application.
  if (!marketIqPreviewEnabled()) notFound();

  const hasProduct = await viewerHasProductAccess("market_iq");
  if (!hasProduct) notFound();

  const marketEntitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(marketEntitlement, CLEVELAND_MARKET_ID)) notFound();

  return <ClevelandPilot />;
}
