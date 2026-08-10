import { auth } from "@clerk/nextjs/server";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isMarketEntitled, resolveViewerEntitlement } from "@/lib/auth/market-entitlements.server";
import { viewerHasProductAccess } from "@/lib/auth/product-entitlements.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseJsonArray, parseMarketIqWatchlistInput } from "@/lib/market-iq/watchlists";
import { prisma } from "@/lib/prisma";

async function canUseClevelandMarketIq() {
  if (!marketIqPreviewEnabled()) return false;
  if (!(await viewerHasProductAccess("market_iq"))) return false;
  const entitlement = await resolveViewerEntitlement();
  return isMarketEntitled(entitlement, CLEVELAND_MARKET_ID);
}

function view(row: {
  id: string;
  name: string;
  marketId: string;
  geographyType: string;
  geographyValues: string;
  propertyTypes: string;
  bedroomCounts: string;
  alertsEnabled: boolean;
  alertCadence: string;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    marketId: row.marketId,
    geographyType: row.geographyType,
    geographyValues: parseJsonArray<string>(row.geographyValues),
    propertyTypes: parseJsonArray<string>(row.propertyTypes),
    bedroomCounts: parseJsonArray<number>(row.bedroomCounts),
    alertsEnabled: row.alertsEnabled,
    alertCadence: row.alertCadence,
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
  return Response.json({ watchlists: rows.map(view) });
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
  return Response.json({ watchlist: view(row) }, { status: 201 });
}
