import test from "node:test";
import { strict as assert } from "node:assert";
import { signUnsubToken, verifyUnsubToken } from "./digest-unsubscribe";

// Set before any test runs. digest-unsubscribe reads DIGEST_UNSUB_SECRET
// lazily (inside secret(), at call time), so a static import is fine — no
// top-level await needed (which this repo's tsx test runner rejects).
process.env.DIGEST_UNSUB_SECRET = "test-secret-do-not-use-in-prod";

test("sign then verify round-trips for the same user", () => {
  const t = signUnsubToken("user_123");
  assert.equal(verifyUnsubToken("user_123", t), true);
});

test("token for one user does not verify for another", () => {
  const t = signUnsubToken("user_123");
  assert.equal(verifyUnsubToken("user_999", t), false);
});

test("tampered token is rejected", () => {
  const t = signUnsubToken("user_123");
  assert.equal(verifyUnsubToken("user_123", t.slice(0, -2) + "xy"), false);
});

test("garbage / empty token is rejected without throwing", () => {
  assert.equal(verifyUnsubToken("user_123", ""), false);
  assert.equal(verifyUnsubToken("user_123", "!!!"), false);
});
