export const MARKET_IQ_LISTING_FEED_STALE_AFTER_MS = 10 * 60 * 1_000;

export function marketIqListingFeedStaleBefore(now: Date): Date {
  return new Date(now.getTime() - MARKET_IQ_LISTING_FEED_STALE_AFTER_MS);
}

export function scheduledMarketIqListingFeedOperationKey(input: {
  marketId: string;
  now: Date;
}): string {
  return `listing-feed:${input.marketId}:${input.now.toISOString().slice(0, 10)}`;
}

export class MarketIqListingFeedAlreadyRunningError extends Error {
  constructor() {
    super("A Market IQ listing refresh is already running.");
    this.name = "MarketIqListingFeedAlreadyRunningError";
  }
}

export class MarketIqListingFeedOperationFailedError extends Error {
  constructor() {
    super("This scheduled Market IQ listing refresh already reached a failed final state.");
    this.name = "MarketIqListingFeedOperationFailedError";
  }
}
