type PrismaErrorShape = { code?: unknown; meta?: unknown };

export function isMissingDailyWatchlistTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as PrismaErrorShape;
  if (candidate.code !== "P2021") return false;
  if (!candidate.meta || typeof candidate.meta !== "object") return true;
  const meta = candidate.meta as { modelName?: unknown; table?: unknown };
  if (typeof meta.modelName === "string") return meta.modelName === "MarketIqDailyWatchlist";
  if (typeof meta.table === "string") return meta.table.endsWith("MarketIqDailyWatchlist");
  return true;
}
