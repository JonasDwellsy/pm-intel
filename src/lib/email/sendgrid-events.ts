import { createHash, createPublicKey, verify } from "node:crypto";

export const SENDGRID_EVENT_TYPES = ["processed", "deferred", "delivered", "bounce", "dropped", "spamreport", "unsubscribe", "open", "click"] as const;
export type SendgridEventType = typeof SENDGRID_EVENT_TYPES[number];

export type SendgridWebhookEvent = {
  event?: unknown; timestamp?: unknown; sg_event_id?: unknown; sg_message_id?: unknown;
  reason?: unknown; response?: unknown; status?: unknown; dwellsy_kind?: unknown;
  dwellsy_record_id?: unknown; dwellsy_portfolio_id?: unknown;
};

function stringValue(value: unknown, maxLength = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

export function parseSendgridEvents(value: unknown): SendgridWebhookEvent[] {
  return Array.isArray(value) ? value.filter((item): item is SendgridWebhookEvent => Boolean(item && typeof item === "object")).slice(0, 1000) : [];
}

export function sendgridEventType(event: SendgridWebhookEvent): SendgridEventType | null {
  const value = stringValue(event.event, 40);
  return SENDGRID_EVENT_TYPES.includes(value as SendgridEventType) ? value as SendgridEventType : null;
}

export function sendgridEventId(event: SendgridWebhookEvent): string {
  return stringValue(event.sg_event_id, 255) ?? `fallback:${createHash("sha256").update(JSON.stringify(event)).digest("hex")}`;
}

export function sendgridOccurredAt(event: SendgridWebhookEvent): Date {
  const timestamp = typeof event.timestamp === "number" ? event.timestamp : Number(event.timestamp);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : new Date();
}

export function sendgridEngagementStrength(type: SendgridEventType): "operational" | "directional" | "explicit" {
  if (type === "click") return "explicit";
  if (type === "open") return "directional";
  return "operational";
}

export function isSendgridFailure(type: SendgridEventType): boolean {
  return type === "bounce" || type === "dropped" || type === "spamreport" || type === "unsubscribe";
}

export function sanitizeSendgridEvent(event: SendgridWebhookEvent) {
  return {
    providerMessageId: stringValue(event.sg_message_id, 255),
    reason: stringValue(event.reason, 500) ?? stringValue(event.response, 500),
    responseCode: stringValue(event.status, 50),
    messageKind: stringValue(event.dwellsy_kind, 40),
    messageRecordId: stringValue(event.dwellsy_record_id, 128),
    portfolioId: stringValue(event.dwellsy_portfolio_id, 128),
  };
}

export function verifySendgridSignature(input: { payload: string; timestamp: string; signature: string; publicKey: string }): boolean {
  try {
    const trimmedKey = input.publicKey.trim();
    const key = trimmedKey.includes("BEGIN PUBLIC KEY")
      ? createPublicKey(trimmedKey)
      : createPublicKey({ key: Buffer.from(trimmedKey, "base64"), format: "der", type: "spki" });
    return verify("sha256", Buffer.from(input.timestamp + input.payload), key, Buffer.from(input.signature, "base64"));
  } catch { return false; }
}
