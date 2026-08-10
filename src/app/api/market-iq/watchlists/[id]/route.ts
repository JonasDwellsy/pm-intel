import { auth } from "@clerk/nextjs/server";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { parseMarketIqWatchlistInput } from "@/lib/market-iq/watchlists";
import { canUseClevelandMarketIq, marketIqWatchlistView } from "@/lib/market-iq/watchlists.server";
import { prisma } from "@/lib/prisma";

async function context() {
  const { userId } = await auth();
  if (!userId) return { error: Response.json({ error: "Unauthorized." }, { status: 401 }) };
  if (!(await canUseClevelandMarketIq())) {
    return { error: Response.json({ error: "Not found." }, { status: 404 }) };
  }
  const { organizationId } = await getActiveOrgContext();
  if (!organizationId) {
    return { error: Response.json({ error: "Workspace not ready." }, { status: 503 }) };
  }
  return { organizationId };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await context();
  if ("error" in resolved) return resolved.error;
  const { id } = await params;
  const existing = await prisma.marketIqWatchlist.findFirst({
    where: { id, organizationId: resolved.organizationId, marketId: CLEVELAND_MARKET_ID },
    select: { id: true },
  });
  if (!existing) return Response.json({ error: "Watchlist not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = parseMarketIqWatchlistInput(body, CLEVELAND_MARKET_ID);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 });
  const input = parsed.value;
  const row = await prisma.marketIqWatchlist.update({
    where: { id },
    data: {
      name: input.name,
      geographyType: input.geographyType,
      geographyValues: JSON.stringify(input.geographyValues),
      propertyTypes: JSON.stringify(input.propertyTypes),
      bedroomCounts: JSON.stringify(input.bedroomCounts),
      alertsEnabled: input.alertsEnabled,
      alertCadence: input.alertCadence,
    },
  });
  return Response.json({ watchlist: marketIqWatchlistView(row) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await context();
  if ("error" in resolved) return resolved.error;
  const { id } = await params;
  const deleted = await prisma.marketIqWatchlist.deleteMany({
    where: { id, organizationId: resolved.organizationId, marketId: CLEVELAND_MARKET_ID },
  });
  if (!deleted.count) return Response.json({ error: "Watchlist not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
