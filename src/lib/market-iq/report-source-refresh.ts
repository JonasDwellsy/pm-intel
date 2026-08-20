type RefreshEnvironment = Record<string, string | undefined>;

export function marketIqReportSourceRefreshEnabled(env: RefreshEnvironment): boolean {
  return (
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_PROJECT_PRODUCTION_URL === "market-iq-mu.vercel.app" &&
    env.MARKET_IQ_PREVIEW_ENABLED === "1" &&
    env.MARKET_IQ_USE_PROJECT_DATABASE === "1" &&
    env.DWELLSY_LIVE_RUNTIME_ENABLED === "1"
  );
}
