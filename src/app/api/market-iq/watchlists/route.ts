import { auth } from "@clerk/nextjs/server";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { parseMarketIqWatchlistInput } from "@/lib/market-iq/watchlists";
import { canUseClevelandMarketIq, marketIqWatchlistView } from "@/lib/market-iq/watchlists.server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!(await canUseClevelandMarketIq())) return Response.json({ error: "Not found." }, { status: 404 });
  const { organizationId } = await getActiveOrgContext();
  if (!organizationId) return Response.json({ error: "Workspace not ready." }, { status: 503 });
  const rows = await prisma.marketIqWatchlist.findMany({
    where: { organizationId, marketId: CLEVELAND_MARKET_ID },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ watchlists: rows.map(marketIqWatchlistView) });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!(await canUseClevelandMarketIq())) return Response.json({ error: "Not found." }, { status: 404 });
  const { organizationId } = await getActiveOrgContext();
  if (!organizationId) return Response.json({ error: "Workspace not ready." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = parseMarketIqWatchlistInput(body, CLEVELAND_MARKET_ID);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 });

  const input = parsed.value;
  const row = await prisma.marketIqWatchlist.create({
    data: {
      name: input.name,
      ownerId: userId,
      organizationId,
      marketId: input.marketId,
      geographyType: input.geographyType,
      geographyValues: JSON.stringify(input.geographyValues),
      propertyTypes: JSON.stringify(input.propertyTypes),
      bedroomCounts: JSON.stringify(input.bedroomCounts),
      alertsEnabled: input.alertsEnabled,
      alertCadence: input.alertCadence,
    },
  });
  return Response.json({ watchlist: marketIqWatchlistView(row) }, { status: 201 });
}
