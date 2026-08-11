export interface OwnerWatchObjectRef {
  objectType: string;
  objectKey: string;
  label: string;
}

export interface OwnerWatchActivityEvent {
  id: string;
  kind: "evidence" | "decision" | "outcome" | "source";
  headline: string;
  detail: string;
  href: string;
  severity: string;
  occurredAt: Date;
  objects: OwnerWatchObjectRef[];
}

export interface OwnerWatchReviewWatermark {
  objectType: string;
  objectKey: string;
  reviewedThrough: Date;
}

function identity(value: { objectType: string; objectKey: string }): string {
  return `${value.objectType}:${value.objectKey}`;
}

export function buildOwnerWatchActivity(input: {
  events: OwnerWatchActivityEvent[];
  pinnedObjects: Array<{ objectType: string; objectKey: string }>;
  reviews: OwnerWatchReviewWatermark[];
  limit?: number;
}) {
  const pins = new Set(input.pinnedObjects.map(identity));
  const reviewed = new Map(input.reviews.map((review) => [identity(review), review.reviewedThrough]));
  const globalReviewedAt = reviewed.get("watchlist:all") ?? null;
  const relevant = input.events.filter((event) =>
    event.kind === "source" || pins.size === 0 || event.objects.some((object) => pins.has(identity(object)))
  );
  const decorated = relevant.map((event) => {
    const watchedObjects = pins.size ? event.objects.filter((object) => pins.has(identity(object))) : event.objects;
    const isNew = watchedObjects.length === 0
      ? !globalReviewedAt || event.occurredAt > globalReviewedAt
      : watchedObjects.some((object) => {
          const watermark = reviewed.get(identity(object)) ?? globalReviewedAt;
          return !watermark || event.occurredAt > watermark;
        });
    return { ...event, isNew };
  }).sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  const limited = decorated.slice(0, input.limit ?? 60);
  return {
    events: limited,
    newEvents: limited.filter((event) => event.isNew),
    priorEvents: limited.filter((event) => !event.isNew),
    lastReviewedAt: globalReviewedAt,
    isFocused: pins.size > 0,
  };
}
