import { parseMarketIqDailySavedView } from "@/lib/market-iq/daily-event-explorer";
import { isMissingDailyViewPreferenceTableError } from "@/lib/market-iq/daily-view-preference";
import { prisma } from "@/lib/prisma";

export async function loadMarketIqDailyViewPreference(input: {
  organizationId: string;
  userId: string;
  marketId: string;
}) {
  const preference = await prisma.marketIqDailyViewPreference
    .findUnique({
      where: {
        organizationId_userId_marketId: input,
      },
      select: { version: true, filters: true },
    })
    .catch((error: unknown) => {
      if (isMissingDailyViewPreferenceTableError(error)) return null;
      throw error;
    });
  if (!preference || preference.version !== 1) return null;
  return parseMarketIqDailySavedView(preference.filters);
}
