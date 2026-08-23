import { createHash } from "node:crypto";

export type ClerkWebhookSink = "posthog" | "usage";

/**
 * Build a deterministic UUID for one side effect of a verified Clerk webhook.
 * Replays carry the same svix-id, so the sink sees the same event identity.
 * Sink and event name keep distinct side effects from colliding.
 */
export function clerkWebhookEventId(
  svixId: string,
  sink: ClerkWebhookSink,
  eventName: string,
): string {
  const hex = createHash("sha256")
    .update(`clerk:${svixId}:${sink}:${eventName}`)
    .digest("hex")
    .slice(0, 32);

  // Shape the digest as an RFC 4122 UUID. The version/variant bits identify
  // this as a name-derived UUID while retaining deterministic payload bits.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
