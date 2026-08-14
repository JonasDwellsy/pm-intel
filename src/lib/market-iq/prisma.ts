import "server-only";
import { PrismaClient as MarketIqPrismaClient } from "@/generated/market-iq";

const globalForMarketIqPrisma = globalThis as unknown as {
  marketIqPrisma: MarketIqPrismaClient | undefined;
};

/**
 * Database client for source observations and canonical market facts only.
 *
 * Never fall back to DATABASE_URL here. A missing Market IQ connection must
 * fail closed instead of silently writing analytical data into the customer
 * and Operator IQ database.
 */
export const marketIqPrisma =
  globalForMarketIqPrisma.marketIqPrisma ?? new MarketIqPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForMarketIqPrisma.marketIqPrisma = marketIqPrisma;
}

export function marketIqDatabaseConfigured(): boolean {
  return Boolean(
    process.env.MARKET_IQ_DATABASE_URL &&
      process.env.MARKET_IQ_DATABASE_URL_UNPOOLED
  );
}
