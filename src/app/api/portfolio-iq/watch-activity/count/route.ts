import { NextResponse } from "next/server";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { portfolioIqPreviewEnabled } from "@/lib/portfolio-iq/feature";
import { loadOwnerWatchActivity } from "@/lib/portfolio-iq/owner-watch-activity.server";
import { routeOwnerAttention } from "@/lib/portfolio-iq/owner-attention-routing";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!portfolioIqPreviewEnabled()) return NextResponse.json({ count: 0 }, { status: 404 });
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId || !organizationId) return NextResponse.json({ count: 0 }, { status: 401 });
  const data = await loadOwnerWatchActivity({ userId, organizationId });
  if (!data) return NextResponse.json({ count: 0 }, { status: 404 });
  const routed = routeOwnerAttention({ events: data.activity.events });
  return NextResponse.json({ count: routed.eligibleUnreadCount });
}
