import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSendgridFailure, parseSendgridEvents, sanitizeSendgridEvent, sendgridEngagementStrength, sendgridEventId, sendgridEventType, verifySendgridSignature } from "@/lib/email/sendgrid-events";

test("SendGrid signature verification accepts the exact signed payload only", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const payload = JSON.stringify([{ event: "delivered", sg_event_id: "evt-1" }]);
  const timestamp = "1786500000";
  const signature = sign("sha256", Buffer.from(timestamp + payload), privateKey).toString("base64");
  const verificationKey = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  assert.equal(verifySendgridSignature({ payload, timestamp, signature, publicKey: verificationKey }), true);
  assert.equal(verifySendgridSignature({ payload: `${payload} `, timestamp, signature, publicKey: verificationKey }), false);
});

test("event parsing is bounded and keeps only supported evidence", () => {
  const events = parseSendgridEvents([{ event: "open" }, null, "bad", { event: "click" }]);
  assert.equal(events.length, 2);
  assert.equal(sendgridEventType(events[0]), "open");
  assert.equal(sendgridEngagementStrength("open"), "directional");
  assert.equal(sendgridEngagementStrength("click"), "explicit");
  assert.equal(sendgridEventType({ event: "group_unsubscribe" }), null);
});

test("failures are limited to events that require staff remediation", () => {
  assert.equal(isSendgridFailure("bounce"), true);
  assert.equal(isSendgridFailure("dropped"), true);
  assert.equal(isSendgridFailure("spamreport"), true);
  assert.equal(isSendgridFailure("unsubscribe"), true);
  assert.equal(isSendgridFailure("open"), false);
});

test("telemetry avoids raw recipient, URL, IP, and user-agent retention", () => {
  const clean = sanitizeSendgridEvent({ event: "click", sg_message_id: "message.abc", reason: "reason", dwellsy_kind: "owner_digest", dwellsy_record_id: "delivery-1", dwellsy_portfolio_id: "portfolio-1" });
  assert.deepEqual(clean, { providerMessageId: "message.abc", reason: "reason", responseCode: null, messageKind: "owner_digest", messageRecordId: "delivery-1", portfolioId: "portfolio-1" });
  assert.match(sendgridEventId({ event: "open", timestamp: 1 }), /^fallback:/);
});

test("SendGrid telemetry migration and webhook remain additive and signed", () => {
  const migration = readFileSync("prisma/migrations/20260812070000_portfolio_iq_email_telemetry/migration.sql", "utf8");
  const route = readFileSync("src/app/api/sendgrid/events/route.ts", "utf8");
  const sender = readFileSync("src/lib/email/send.ts", "utf8");
  assert.match(migration, /CREATE TABLE "PortfolioIqEmailEvent"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PropertyManager"|ALTER TABLE "CanonicalOperator"|ALTER TABLE "WatchList"/);
  assert.match(route, /verifySendgridSignature/);
  assert.match(route, /SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY/);
  assert.match(sender, /customArgs/);
});

test("portfolio email sends attach stable linkage and do not claim delivery on API acceptance", () => {
  const digest = readFileSync("src/lib/portfolio-iq/digest-run.server.ts", "utf8");
  const preview = readFileSync("src/lib/portfolio-iq/owner-briefing-delivery.server.ts", "utf8");
  const collaboration = readFileSync("src/app/portfolio-iq/collaboration-actions.ts", "utf8");
  for (const source of [digest, preview, collaboration]) {
    assert.match(source, /dwellsy_kind/);
    assert.match(source, /dwellsy_record_id/);
    assert.match(source, /acceptedAt/);
  }
  assert.doesNotMatch(digest, /deliveredAt: result\.ok \? now/);
  assert.doesNotMatch(preview, /deliveredAt: result\.ok \? now/);
  assert.match(digest, /\["sent", "delivered"\]/);
});

test("Market IQ report sends use the shared signed webhook without exposing owner-facing Dwellsy branding", () => {
  const events = readFileSync("src/lib/email/sendgrid-events.server.ts", "utf8");
  const migration = readFileSync("prisma/migrations/20260818030000_market_iq_email_event_ledger/migration.sql", "utf8");
  const delivery = readFileSync("src/lib/market-iq/report/delivery.server.ts", "utf8");
  const email = readFileSync("src/lib/market-iq/report/email.ts", "utf8");
  assert.match(events, /market_iq_report/);
  assert.match(events, /marketIqReportSend\.updateMany/);
  assert.match(events, /marketIqEmailEvent\.create/);
  assert.match(events, /P2002/);
  assert.match(migration, /CREATE TABLE "MarketIqEmailEvent"/);
  assert.match(migration, /providerEventId_key/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER TABLE "PropertyManager"|ALTER TABLE "CanonicalOperator"|ALTER TABLE "WatchList"/);
  assert.match(delivery, /dwellsy_kind: "market_iq_report"/);
  assert.match(delivery, /fromName: snapshot\.brand\.displayName/);
  assert.doesNotMatch(email, /Open Market IQ|Operator IQ/);
  assert.match(email, /Market data by Dwellsy IQ/);
});
