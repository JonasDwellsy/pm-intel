import { listEntitledMarketIqMarkets } from "@/data/market-iq/markets";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { loadMarketIqOpenAlertCount } from "@/lib/market-iq/daily-alert-workbench.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export async function GET() {
  if (!marketIqPreviewEnabled()) return Response.json({ error: "Not found." }, { status: 404 });
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!userId || !organizationId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!access.hasProduct) return Response.json({ error: "Not found." }, { status: 404 });
  const count = await loadMarketIqOpenAlertCount({
    organizationId,
    userId,
    marketIds: listEntitledMarketIqMarkets(access.entitlement).map((market) => market.id),
  });
  return Response.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
}
