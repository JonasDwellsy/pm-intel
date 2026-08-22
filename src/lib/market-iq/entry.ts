import { MARKET_IQ_CANONICAL_ROUTES } from "@/lib/market-iq/navigation";

export const MARKET_IQ_MARKETING_PATH = "/market-iq/welcome";
export const MARKET_IQ_APPLICATION_PATH = MARKET_IQ_CANONICAL_ROUTES.marketIntelligence;
export const MARKET_IQ_SUBSCRIBE_PATH = "/market-iq/subscribe?billing=month";

export function marketIqSignInPath(
  returnTo: string = MARKET_IQ_APPLICATION_PATH
): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
}

export function safeMarketIqReturnTo(
  value: string | null | undefined,
  fallback = MARKET_IQ_APPLICATION_PATH
): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, "https://market-iq.invalid");
    const isMarketIqPath =
      parsed.pathname === "/market-iq" ||
      parsed.pathname.startsWith("/market-iq/");
    if (parsed.origin !== "https://market-iq.invalid" || !isMarketIqPath) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function marketIqReturnToForMarket(
  returnTo: string | null | undefined,
  marketId: string
): string {
  const safeReturnTo = safeMarketIqReturnTo(returnTo);
  const parsed = new URL(safeReturnTo, "https://market-iq.invalid");
  if (parsed.pathname === MARKET_IQ_APPLICATION_PATH) {
    parsed.searchParams.set("market", marketId);
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
