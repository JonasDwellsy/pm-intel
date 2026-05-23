// v0.18 (PR #70, Phase 2) — Source-level tests for the analytics
// org-group identification helpers + the ClerkIdentify bridge.
//
// The PostHog calls themselves require a real browser context to
// exercise; we cover the SHAPE of the integration here. If anyone
// removes the org-group call from ClerkIdentify, drops the
// resetGroups() on signout, or breaks the analytics module's
// function exports, these tests catch it.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ANALYTICS_SRC = readFileSync(
  join(process.cwd(), "src/lib/analytics.ts"),
  "utf8"
);
const IDENTIFY_SRC = readFileSync(
  join(process.cwd(), "src/components/analytics/ClerkIdentify.tsx"),
  "utf8"
);

test("analytics module exports the org-group helpers", () => {
  assert.ok(
    ANALYTICS_SRC.includes("export function identifyAnalyticsOrg"),
    "identifyAnalyticsOrg must be exported"
  );
  assert.ok(
    ANALYTICS_SRC.includes("export function resetAnalyticsOrg"),
    "resetAnalyticsOrg must be exported"
  );
});

test("identifyAnalyticsOrg calls posthog.group with correct shape", () => {
  // PostHog's group analytics requires (groupType, groupKey,
  // properties). We use 'organization' as the group type — must
  // match what's configured in the PostHog dashboard for group
  // analytics to work.
  assert.ok(
    /posthog\.group\(\s*["']organization["']\s*,\s*orgId\s*,\s*\{\s*name: orgName\s*\}\s*\)/.test(
      ANALYTICS_SRC
    ),
    "identifyAnalyticsOrg must call posthog.group('organization', orgId, { name: orgName })"
  );
});

test("resetAnalyticsOrg calls posthog.resetGroups", () => {
  assert.ok(
    ANALYTICS_SRC.includes("posthog.resetGroups()"),
    "resetAnalyticsOrg must call posthog.resetGroups()"
  );
});

test("ClerkIdentify imports useOrganization and the org-group helpers", () => {
  // Regression guard: if anyone removes the org-group binding from
  // ClerkIdentify, group analytics silently stops working for new
  // sessions.
  assert.ok(
    IDENTIFY_SRC.includes("useOrganization"),
    "ClerkIdentify must import useOrganization from @clerk/nextjs"
  );
  assert.ok(
    IDENTIFY_SRC.includes("identifyAnalyticsOrg"),
    "ClerkIdentify must use identifyAnalyticsOrg"
  );
  assert.ok(
    IDENTIFY_SRC.includes("resetAnalyticsOrg"),
    "ClerkIdentify must use resetAnalyticsOrg"
  );
});

test("ClerkIdentify resets BOTH user identity AND org group on signout", () => {
  // Critical for the cross-account-on-same-browser case: without
  // resetAnalyticsOrg() on signout, the next anonymous session
  // would inherit the previous user's org attribution.
  // We can't easily check the exact JS sequencing in a static read,
  // but we can confirm both reset functions are called from the
  // module.
  assert.ok(
    IDENTIFY_SRC.includes("resetAnalyticsUser()"),
    "ClerkIdentify must call resetAnalyticsUser on signout"
  );
  assert.ok(
    IDENTIFY_SRC.includes("resetAnalyticsOrg()"),
    "ClerkIdentify must call resetAnalyticsOrg on signout"
  );
});
