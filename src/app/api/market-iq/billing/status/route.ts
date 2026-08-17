import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled } from "@/lib/auth/market-entitlements.server";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { resolveViewerMarketIqAccess } from "@/lib/market-iq/billing/access.server";
import { marketIqPlanForKey } from "@/lib/market-iq/billing/plans";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!marketIqPreviewEnabled()) return new Response("Not found", { status: 404 });
  const [{ userId, organizationId }, access] = await Promise.all([
    getActiveOrgContext(),
    resolveViewerMarketIqAccess(),
  ]);
  if (!userId) return new Response("Unauthorized", { status: 401 });
  if (!organizationId) return Response.json({ ready: false, reason: "workspace_required", nextUrl: "/setup-workspace" }, { headers: { "Cache-Control": "no-store" } });

  const preference = await prisma.marketIqWorkspacePreference.findUnique({
    where: { organizationId },
    select: { onboardingCompletedAt: true },
  });
  const ready = access.hasProduct && isMarketEntitled(access.entitlement, CLEVELAND_MARKET_ID);
  const plan = marketIqPlanForKey(access.planKey);
  const activationComplete = Boolean(preference?.onboardingCompletedAt);
  const nextUrl = activationComplete
    ? "/market-iq"
    : access.capabilities.publishClientReports
      ? "/market-iq/get-started?step=1&purchase=success"
      : "/market-iq/get-started?step=2&purchase=success";

  return Response.json({
    ready,
    reason: ready ? "active" : "provisioning",
    planName: plan?.name ?? null,
    planTier: plan?.tier ?? null,
    activationComplete,
    nextUrl,
  }, { headers: { "Cache-Control": "no-store" } });
}
