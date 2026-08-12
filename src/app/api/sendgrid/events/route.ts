import * as Sentry from "@sentry/nextjs";
import { parseSendgridEvents, verifySendgridSignature } from "@/lib/email/sendgrid-events";
import { processSendgridEvent } from "@/lib/email/sendgrid-events.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const publicKey = process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY;
  if (!publicKey) return Response.json({ error: "Webhook not configured" }, { status: 503 });
  const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp");
  const signature = request.headers.get("x-twilio-email-event-webhook-signature");
  if (!timestamp || !signature) return Response.json({ error: "Missing signature headers" }, { status: 400 });
  const payload = await request.text();
  if (Buffer.byteLength(payload) > 1_000_000) return Response.json({ error: "Payload too large" }, { status: 413 });
  if (!verifySendgridSignature({ payload, timestamp, signature, publicKey })) return Response.json({ error: "Invalid signature" }, { status: 401 });
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const events = parseSendgridEvents(parsed);
  const result = { recorded: 0, duplicate: 0, ignored: 0, failed: 0 };
  for (const event of events) {
    try { result[await processSendgridEvent(event)]++; }
    catch (error) { result.failed++; Sentry.captureException(error, { tags: { webhook: "sendgrid", event_type: String(event.event ?? "unknown") } }); }
  }
  return Response.json({ accepted: events.length, ...result }, { status: result.failed ? 207 : 200 });
}
