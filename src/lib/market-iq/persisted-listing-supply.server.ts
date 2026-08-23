import "server-only";

import {
  resolvePersistedMarketListingPulse,
  unavailablePersistedMarketListingPulse,
} from "@/lib/market-iq/persisted-listing-supply";
import type { MarketIqListingPulse } from "@/lib/market-iq/data/types";
import { marketIqPrisma } from "@/lib/market-iq/prisma";

export async function loadPersistedMarketListingPulse(input: {
  marketId: string;
  cbsaCode: string;
  marketName: string;
  now?: Date;
}): Promise<MarketIqListingPulse> {
  const now = input.now ?? new Date();
  try {
    const [marketSnapshot, nationalSnapshot] = await Promise.all([
      marketIqPrisma.marketIqListingSupplySnapshot.findFirst({
        where: { marketId: input.marketId },
        orderBy: [{ snapshotDate: "desc" }, { capturedAt: "desc" }],
        include: {
          feedRun: {
            select: {
              status: true,
              newCount: true,
              relistedCount: true,
              reactivatedCount: true,
              priceChangeCount: true,
              deactivatedCount: true,
            },
          },
        },
      }),
      marketIqPrisma.marketIqNationalSupplySnapshot.findFirst({
        where: { cbsaCode: input.cbsaCode },
        orderBy: [{ snapshotDate: "desc" }, { capturedAt: "desc" }],
      }),
    ]);
    const snapshot = [marketSnapshot, nationalSnapshot]
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ?? null;
    return resolvePersistedMarketListingPulse({ marketName: input.marketName, now, snapshot });
  } catch (error) {
    console.warn("[Market IQ] Persisted listing supply unavailable", {
      marketId: input.marketId,
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return unavailablePersistedMarketListingPulse({ marketName: input.marketName, attemptedAt: now, reason: "read_failed" });
  }
}
