import { prisma } from "@/lib/prisma";
import type { ScorecardData } from "@/lib/types";
import { parseScorecard } from "@/lib/scorecard/parse";
import {
  resolveViewerEntitlement,
  isMarketEntitled,
} from "@/lib/auth/market-entitlements.server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const pm = await prisma.pM.findUnique({ where: { slug } });

  if (!pm) {
    return Response.json({ error: "PM not found" }, { status: 404 });
  }

  // Entitlement gate — the scorecard JSON is premium data. 404 (not
  // 403) so the endpoint doesn't confirm the operator exists in a
  // market the caller's org hasn't purchased.
  const entitlement = await resolveViewerEntitlement();
  if (!isMarketEntitled(entitlement, pm.marketId)) {
    return Response.json({ error: "PM not found" }, { status: 404 });
  }

  const scorecard: ScorecardData = parseScorecard(pm);
  return Response.json(scorecard);
}
