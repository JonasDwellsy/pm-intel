type PrismaErrorShape = {
  code?: unknown;
  meta?: unknown;
};

export function isMissingDailyViewPreferenceTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as PrismaErrorShape;
  if (candidate.code !== "P2021") return false;
  if (!candidate.meta || typeof candidate.meta !== "object") return true;

  const meta = candidate.meta as { modelName?: unknown; table?: unknown };
  if (typeof meta.modelName === "string") {
    return meta.modelName === "MarketIqDailyViewPreference";
  }
  if (typeof meta.table === "string") {
    return meta.table.endsWith("MarketIqDailyViewPreference");
  }
  return true;
}
