import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clerkWebhookEventId } from "./webhook-idempotency";

const UUID_V5_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("Clerk webhook side-effect IDs are stable RFC 4122 UUIDs", () => {
  const first = clerkWebhookEventId(
    "msg_2abc",
    "posthog",
    "signup_completed"
  );
  const replay = clerkWebhookEventId(
    "msg_2abc",
    "posthog",
    "signup_completed"
  );

  assert.equal(first, replay);
  assert.match(first, UUID_V5_PATTERN);
});

test("Clerk webhook side-effect IDs separate deliveries, sinks, and events", () => {
  const ids = new Set([
    clerkWebhookEventId("msg_first", "posthog", "signup_completed"),
    clerkWebhookEventId("msg_second", "posthog", "signup_completed"),
    clerkWebhookEventId("msg_first", "usage", "signup_completed"),
    clerkWebhookEventId("msg_first", "posthog", "login_completed"),
  ]);

  assert.equal(ids.size, 4);
});

test("the Clerk webhook assigns deterministic IDs to every analytics capture", () => {
  const source = readFileSync(
    new URL("../../app/api/clerk/webhook/route.ts", import.meta.url),
    "utf8"
  );
  const captureCount = source.match(/captureServerEvent\(\{/g)?.length ?? 0;
  const posthogIdCount =
    source.match(/eventId: clerkWebhookEventId\([\s\S]*?"posthog"/g)?.length ?? 0;

  assert.equal(captureCount, 10);
  assert.equal(posthogIdCount, captureCount);
  assert.match(source, /handleUserCreated\(event, svixId\)/);
  assert.match(source, /handleSessionCreated\(event, svixId\)/);
});

test("the Clerk webhook makes first-party signup and login rows replay-safe", () => {
  const routeSource = readFileSync(
    new URL("../../app/api/clerk/webhook/route.ts", import.meta.url),
    "utf8"
  );
  const usageSource = readFileSync(
    new URL("../usage/record.ts", import.meta.url),
    "utf8"
  );
  const analyticsSource = readFileSync(
    new URL("../analytics-server.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    routeSource,
    /eventName: "signup",\s*eventId: clerkWebhookEventId\(svixId, "usage", "signup"\)/
  );
  assert.match(
    routeSource,
    /eventName: "login",\s*eventId: clerkWebhookEventId\(svixId, "usage", "login"\)/
  );
  assert.match(usageSource, /prisma\.usageEvent\.upsert\(\{/);
  assert.match(usageSource, /where: \{ id: args\.eventId \}/);
  assert.match(usageSource, /update: \{\}/);
  assert.match(analyticsSource, /uuid: args\.eventId/);
});

test("this phase deliberately leaves webhook retry responses unchanged", () => {
  const source = readFileSync(
    new URL("../../app/api/clerk/webhook/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /catch \(err\) \{[\s\S]*return Response\.json\(\{ received: true \}\);/);
});
