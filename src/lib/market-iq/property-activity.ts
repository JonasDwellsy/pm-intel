import type { MarketIqDailyEdition } from "@/lib/market-iq/daily-edition-archive";
import { buildDailyEventHeadlines } from "@/lib/market-iq/daily-events";
import type {
  MarketIqLeaseUpAlert,
  MarketIqListingEvent,
  MarketIqMarketActivityAvailability,
  MarketIqPropertyActivitySummary,
} from "@/lib/market-iq/listing-events";

export function marketIqPropertyActivityPath(marketId: string, propertyId: string) {
  return `/market-iq/property/${encodeURIComponent(propertyId)}?market=${encodeURIComponent(marketId)}`;
}

export type MarketIqPropertyActivityItem = {
  id: string;
  kind: "new_listing" | "price_change" | "delisting" | "aging_threshold" | "concession" | "lease_up";
  headline: string;
  detail: string;
  observedAt: string;
  editionId: string;
  listingUrl: string | null;
};

export type MarketIqPropertyActivityView = {
  propertyId: string;
  propertyName: string | null;
  propertyManagerName: string | null;
  address: string | null;
  city: string;
  zip: string;
  propertyType: "apartment" | "house" | null;
  imageUrl: string | null;
  listingUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  latestSummary: (MarketIqPropertyActivitySummary & { observedAt: string; editionId: string }) | null;
  activity: MarketIqPropertyActivityItem[];
  leaseUpObserved: boolean;
  editionCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
};

type PropertyEditionValue = {
  marketActivity?: MarketIqMarketActivityAvailability;
};

function propertyEvent(event: MarketIqListingEvent, propertyId: string) {
  return event.propertyId === propertyId;
}

function activityForEdition(edition: MarketIqDailyEdition<PropertyEditionValue>) {
  const availability = edition.value.marketActivity;
  return availability?.state === "available" ? availability.activity : null;
}

export function buildMarketIqPropertyActivityView(input: {
  propertyId: string;
  editions: MarketIqDailyEdition<PropertyEditionValue>[];
}): MarketIqPropertyActivityView | null {
  const items = new Map<string, MarketIqPropertyActivityItem>();
  const involvedEditionIds = new Set<string>();
  let latestSummary: MarketIqPropertyActivityView["latestSummary"] = null;
  let identityEvent: MarketIqListingEvent | null = null;
  let identityLeaseUp: MarketIqLeaseUpAlert | null = null;

  for (const edition of input.editions) {
    const marketActivity = activityForEdition(edition);
    if (!marketActivity) continue;
    const summary = marketActivity.propertySummaries?.find((candidate) => candidate.propertyId === input.propertyId);
    if (!latestSummary && summary) {
      latestSummary = { ...summary, observedAt: marketActivity.asOf, editionId: edition.id };
      involvedEditionIds.add(edition.id);
    }

    const events = marketActivity.events.filter((event) => propertyEvent(event, input.propertyId));
    const leaseUps = (marketActivity.leaseUpAlerts ?? []).filter((alert) => alert.propertyId === input.propertyId);
    if (!identityEvent && events[0]) identityEvent = events[0];
    if (!identityLeaseUp && leaseUps[0]) identityLeaseUp = leaseUps[0];
    if (events.length || leaseUps.length) involvedEditionIds.add(edition.id);

    for (const headline of buildDailyEventHeadlines(events)) {
      const key = `${headline.event.eventType}:${headline.event.id}`;
      if (items.has(key)) continue;
      items.set(key, {
        id: key,
        kind: headline.event.eventType,
        headline: headline.headline,
        detail: headline.detail,
        observedAt: headline.observedAt,
        editionId: edition.id,
        listingUrl: headline.event.listingUrl ?? null,
      });
    }
    for (const alert of leaseUps) {
      const key = `lease_up:${alert.id}`;
      if (items.has(key)) continue;
      items.set(key, {
        id: key,
        kind: "lease_up",
        headline: `${alert.propertyName} arrived with ${alert.newListingCount.toLocaleString("en-US")} new listings`,
        detail: `${alert.address ? `${alert.address} · ` : ""}${alert.city}, ${alert.zip}. Lease-up signal from advertised inventory, not verified construction or occupancy.`,
        observedAt: alert.observedAt,
        editionId: edition.id,
        listingUrl: alert.listingUrl,
      });
    }
  }

  const activity = [...items.values()].sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
  const identity = latestSummary ?? identityLeaseUp ?? identityEvent;
  if (!identity || !activity.length) return null;

  return {
    propertyId: input.propertyId,
    propertyName: identity.propertyName ?? null,
    propertyManagerName: identity.propertyManagerName ?? null,
    address: identity.address ?? null,
    city: identity.city,
    zip: identity.zip,
    propertyType: "propertyType" in identity ? identity.propertyType : "apartment",
    imageUrl: identity.imageUrl ?? null,
    listingUrl: identity.listingUrl ?? null,
    latitude: identity.latitude ?? null,
    longitude: identity.longitude ?? null,
    latestSummary,
    activity,
    leaseUpObserved: activity.some((item) => item.kind === "lease_up"),
    editionCount: involvedEditionIds.size,
    firstObservedAt: activity.at(-1)?.observedAt ?? activity[0].observedAt,
    lastObservedAt: activity[0].observedAt,
  };
}
