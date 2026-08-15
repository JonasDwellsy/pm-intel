import "server-only";
import { PrismaClient as MarketIqPrismaClient } from "@/generated/market-iq";

const globalForMarketIqPrisma = globalThis as unknown as {
  marketIqPrisma: MarketIqPrismaClient | undefined;
};

function projectDatabaseFallbackAllowed(): boolean {
  return (
    process.env.MARKET_IQ_PREVIEW_ENABLED === "1" &&
    process.env.MARKET_IQ_USE_PROJECT_DATABASE === "1" &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL === "market-iq-mu.vercel.app"
  );
}

const marketIqDatabaseUrl =
  process.env.MARKET_IQ_DATABASE_URL ?? (
    projectDatabaseFallbackAllowed() ? process.env.DATABASE_URL : undefined
  );
const marketIqDirectUrl =
  process.env.MARKET_IQ_DATABASE_URL_UNPOOLED ?? (
    projectDatabaseFallbackAllowed() ? process.env.DATABASE_URL_UNPOOLED : undefined
  );

/**
 * Database client for source observations and canonical market facts only.
 *
 * A separately named Market IQ connection is always preferred. The project
 * connection is accepted only for the explicitly authorized standalone
 * Market IQ Vercel preview. Every Operator IQ environment therefore continues
 * to fail closed instead of writing analytical data into its primary store.
 */
export const marketIqPrisma =
  globalForMarketIqPrisma.marketIqPrisma ?? new MarketIqPrismaClient(
    marketIqDatabaseUrl ? { datasourceUrl: marketIqDatabaseUrl } : undefined
  );

if (process.env.NODE_ENV !== "production") {
  globalForMarketIqPrisma.marketIqPrisma = marketIqPrisma;
}

export function marketIqDatabaseConfigured(): boolean {
  return Boolean(marketIqDatabaseUrl && marketIqDirectUrl);
}
