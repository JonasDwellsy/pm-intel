// v0.11 URL cleanup — guard the next.config.ts redirect rule.
//
// We can't easily fire a real HTTP request inside a unit test
// (Next's redirect engine runs in the server middleware layer and
// needs a running app). Instead the test loads the config module
// and asserts the redirects() function returns the exact rule we
// expect:
//   /operator/:slug* → /operators/:slug*, permanent: true
//
// That's the same shape Next.js consumes at boot — so passing
// this test is equivalent to "the rule is registered correctly."

import test from "node:test";
import { strict as assert } from "node:assert";

import nextConfig from "../../../next.config";

test("next.config redirect — /operator/:slug* permanently redirects to /operators/:slug*", async () => {
  assert.ok(
    typeof nextConfig.redirects === "function",
    "next.config must export a redirects() function"
  );

  const rules = await nextConfig.redirects!();
  assert.ok(Array.isArray(rules), "redirects() must return an array");

  const operatorRule = rules.find((r) => r.source === "/operator/:slug*");
  assert.ok(
    operatorRule,
    "Expected a redirect rule with source='/operator/:slug*' — none found"
  );
  assert.equal(
    operatorRule.destination,
    "/operators/:slug*",
    "Destination must be /operators/:slug* so query params + trailing slug segments pass through"
  );
  assert.equal(
    operatorRule.permanent,
    true,
    "Redirect must be permanent (301) for SEO + browser caching"
  );
});

test("next.config redirect — slug parameter pattern uses :slug* (catch-all) so query strings + nested paths preserve", async () => {
  // Next.js's :slug* matcher captures the rest of the path; the
  // query string is forwarded automatically by the redirect
  // engine. This test pins the matcher shape so a future refactor
  // to /operator/:slug (single-segment) doesn't silently drop
  // query params or trailing segments.
  const rules = (await nextConfig.redirects!()) as Array<{
    source: string;
    destination: string;
  }>;
  const operatorRule = rules.find((r) => r.source.startsWith("/operator/"));
  assert.ok(operatorRule);
  assert.match(
    operatorRule.source,
    /:slug\*$/,
    "source matcher must end with :slug* (catch-all)"
  );
  assert.match(
    operatorRule.destination,
    /:slug\*$/,
    "destination must reference the same :slug* capture"
  );
});
