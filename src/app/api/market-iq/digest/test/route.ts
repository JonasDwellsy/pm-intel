import { auth, currentUser } from "@clerk/nextjs/server";
import { CLEVELAND_MARKET_ID } from "@/data/market-iq/cleveland-pilot";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { sendEmail } from "@/lib/email/send";
import { buildMarketIqDigest } from "@/lib/market-iq/digest";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";
import { parseJsonArray, type MarketIqWatchlistView } from "@/lib/market-iq/watchlists";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!marketIqPreviewEnabled() || !userId || !isAdminUser(userId)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const [{ organizationId }, user] = await Promise.all([getActiveOrgContext(), currentUser()]);
  if (!organizationId) return Response.json({ error: "Workspace not ready." }, { status: 503 });
  const email = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses[0]?.emailAddress
    ?? null;
  if (!email) return Response.json({ error: "Your Clerk account has no email address." }, { status: 422 });
  const [rows, alerts] = await Promise.all([
    prisma.marketIqWatchlist.findMany({
      where: {
        organizationId,
        marketId: CLEVELAND_MARKET_ID,
        alertsEnabled: true,
        alertCadence: "weekly",
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.marketIqAlert.findMany({
      where: { marketId: CLEVELAND_MARKET_ID },
      orderBy: [{ observedMonth: "desc" }, { severity: "desc" }],
      take: 100,
    }),
  ]);
  if (!rows.length) return Response.json({ error: "Save a weekly watchlist before sending a test digest." }, { status: 422 });
  const watchlists: MarketIqWatchlistView[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    marketId: row.marketId,
    geographyType: row.geographyType as MarketIqWatchlistView["geographyType"],
    geographyValues: parseJsonArray<string>(row.geographyValues),
    propertyTypes: parseJsonArray<MarketIqWatchlistView["propertyTypes"][number]>(row.propertyTypes),
    bedroomCounts: parseJsonArray<number>(row.bedroomCounts),
    alertsEnabled: row.alertsEnabled,
    alertCadence: row.alertCadence as MarketIqWatchlistView["alertCadence"],
    updatedAt: row.updatedAt.toISOString(),
  }));
  const origin = new URL(request.url).origin;
  const digest = buildMarketIqDigest({
    recipientName: user?.firstName ?? null,
    watchlists,
    alerts,
    dashboardUrl: `${origin}/market-iq`,
  });
  try {
    const sent = await sendEmail({ to: email, ...digest });
    if (!sent.ok) throw new Error(sent.error);
    return Response.json({
      sent: true,
      messageId: sent.id,
      recipient: email,
      alertCount: digest.alertCount,
    });
  } catch (error) {
    console.error("[market-iq] test digest failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not send the test digest." }, { status: 502 });
  }
}
