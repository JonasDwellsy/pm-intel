import type { MarketIqListingEvent } from "@/lib/market-iq/listing-events";

export type MarketIqDailyEventHeadline = {
  id: string;
  section: "new_to_market" | "rent_changes" | "off_market" | "aging_watch";
  headline: string;
  detail: string;
  observedAt: string;
  event: MarketIqListingEvent;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function propertyLabel(event: MarketIqListingEvent) {
  const bedrooms = event.bedrooms === 0 ? "studio" : `${event.bedrooms}-bedroom`;
  return `${bedrooms} ${event.propertyType}`;
}

function hasObservedAt(event: MarketIqListingEvent) {
  return event.observedAt.trim().length > 0 && Number.isFinite(Date.parse(event.observedAt));
}

export function buildDailyEventHeadlines(
  events: MarketIqListingEvent[],
): MarketIqDailyEventHeadline[] {
  const headlines: MarketIqDailyEventHeadline[] = [];
  for (const event of events) {
    if (!hasObservedAt(event) || !Number.isFinite(event.askingRent)) continue;
    const location = `${event.city}, ${event.zip}`;

    if (event.eventType === "new_listing") {
      headlines.push({
        id: event.id,
        section: "new_to_market",
        headline: `New ${propertyLabel(event)} in ${event.city} at ${money(event.askingRent)}`,
        detail: `${event.address ?? location} was observed with an asking rent of ${money(event.askingRent)}.`,
        observedAt: event.observedAt,
        event,
      });
      continue;
    }

    if (event.eventType === "delisting") {
      const age = event.listingAgeDays;
      headlines.push({
        id: event.id,
        section: "off_market",
        headline: `${propertyLabel(event)} in ${event.city} went off market after ${age.toLocaleString("en-US")} ${age === 1 ? "day" : "days"} listed`,
        detail: `${event.address ?? location} was last advertised at ${money(event.askingRent)} asking rent. It may have leased or been withdrawn; the outcome is undetermined.`,
        observedAt: event.observedAt,
        event,
      });
      continue;
    }

    if (event.eventType === "aging_threshold") {
      const age = event.listingAgeDays;
      headlines.push({
        id: event.id,
        section: "aging_watch",
        headline: `${propertyLabel(event)} in ${event.city} reached ${age} days live`,
        detail: `${event.address ?? location} was still active at the source read with an advertised asking rent of ${money(event.askingRent)}. This is live age, not days on market.`,
        observedAt: event.observedAt,
        event,
      });
      continue;
    }

    if (event.previousRent === null || !Number.isFinite(event.previousRent)) continue;
    headlines.push({
      id: event.id,
      section: "rent_changes",
      headline: `Asking rent changed for a ${propertyLabel(event)} in ${event.city}`,
      detail: `${event.address ?? location} changed from ${money(event.previousRent)} to ${money(event.askingRent)} asking rent.`,
      observedAt: event.observedAt,
      event,
    });
  }
  return headlines;
}
