// v0.18 (PR #71, Phase 3) — Source-level tests for the Clerk
// webhook extension that adds invitation events + membership
// analytics + PendingWelcome writes.
//
// Behavioral tests require a real Postgres + Clerk webhook delivery
// which we don't wire up in CI. This file covers the source-level
// contracts that catch the most destructive regressions:
//
//   - All three organizationInvitation.* event types are dispatched
//   - The accepted-handler writes PendingWelcome
//   - The membership handlers fire org_member_* events
//   - Privacy guardrail: full email never leaves the webhook layer

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEBHOOK_SRC = readFileSync(
  join(process.cwd(), "src/app/api/clerk/webhook/route.ts"),
  "utf8"
);

test("webhook dispatcher handles all three organizationInvitation.* events", () => {
  for (const eventType of [
    "organizationInvitation.created",
    "organizationInvitation.accepted",
    "organizationInvitation.revoked",
  ]) {
    assert.ok(
      WEBHOOK_SRC.includes(`case "${eventType}":`),
      `webhook dispatcher must handle ${eventType}`
    );
  }
});

test("invitation handlers use camelCase Clerk event names, not dotted notation", () => {
  // Regression guard for the spec naming mismatch noted in PR #71
  // discovery: Clerk actually uses `organizationInvitation.created`
  // (camelCase, two segments), NOT `organization.invitation.created`
  // (dotted, three segments). If anyone refactors and accidentally
  // switches to the spec's dotted form, the handlers stop firing.
  assert.ok(
    !WEBHOOK_SRC.includes(`case "organization.invitation.`),
    "must NOT use dotted three-segment notation"
  );
});

test("organizationInvitation.accepted writes PendingWelcome row", () => {
  // The welcome toast trigger depends on this row being written.
  // If anyone removes the upsert, the welcome flow silently breaks.
  assert.ok(
    WEBHOOK_SRC.includes("prisma.pendingWelcome.upsert"),
    "accepted handler must upsert PendingWelcome"
  );
  // The upsert must use the unique composite key so re-delivery is
  // a no-op.
  assert.ok(
    WEBHOOK_SRC.includes("userId_organizationId"),
    "PendingWelcome upsert must use the userId_organizationId unique key"
  );
});

test("invitation events fire with email DOMAIN only, never full email", () => {
  // PRIVACY-CRITICAL regression guard. The handler MUST call
  // extractEmailDomain on the email before sending to PostHog.
  // If anyone removes that helper call and uses the raw email
  // directly in the captureServerEvent call, this catches it.

  // Confirm extractEmailDomain is imported.
  assert.ok(
    WEBHOOK_SRC.includes("extractEmailDomain"),
    "must import + use extractEmailDomain"
  );

  // Confirm the captureServerEvent calls for invitation events use
  // extractEmailDomain (not the raw email_address). Loose check:
  // any `invited_email_domain:` property must be assigned from
  // `extractEmailDomain(...)`, never from a bare `email`.
  const invitedEmailDomainAssignments = WEBHOOK_SRC.match(
    /invited_email_domain:\s*[^,\n}]+/g
  );
  assert.ok(
    invitedEmailDomainAssignments &&
      invitedEmailDomainAssignments.length >= 3,
    "must have invited_email_domain assignments for the 3 invitation events"
  );
  for (const assignment of invitedEmailDomainAssignments ?? []) {
    assert.ok(
      assignment.includes("extractEmailDomain"),
      `invited_email_domain must always go through extractEmailDomain, got: ${assignment}`
    );
  }
});

test("membership handlers fire the three documented analytics events", () => {
  // org_member_joined, org_member_removed, org_role_changed must
  // appear inside membership handlers (not just declared in the
  // ServerEventName union). Regression guard for "the union has
  // them but the handler stopped emitting them."
  for (const eventName of [
    "org_member_joined",
    "org_member_removed",
    "org_role_changed",
    "org_member_invited",
    "org_invitation_revoked",
  ]) {
    assert.ok(
      WEBHOOK_SRC.includes(`event: "${eventName}"`),
      `webhook handler must fire ${eventName} via captureServerEvent`
    );
  }
});

test("org_member_joined skips personal-org memberships", () => {
  // Important detail: personal orgs are auto-provisioned at signup
  // and already fire signup_completed via the user.created handler.
  // Adding org_member_joined for personal orgs would double-count
  // the invitation funnel. The membership handler must check
  // personalForUserId before firing.
  assert.ok(
    WEBHOOK_SRC.includes("personalForUserId"),
    "membership handler must check personalForUserId to avoid double-counting personal orgs"
  );
  assert.ok(
    WEBHOOK_SRC.includes("isPersonalOrg"),
    "membership handler must have an isPersonalOrg guard"
  );
});

// v0.18 PR #72 hotfix — Regression guard mirroring the
// "personal-org-double-count" pattern above. The original PR #71
// handleMembershipDeleted pre-read the OrganizationMembership row
// and ONLY fired org_member_removed when the pre-read returned a
// row. If the row was missing in our DB (e.g., upstream membership
// .created webhook had errored or early-returned), the analytics
// event silently disappeared.
//
// Fix: read user + org directly from the webhook payload, not from
// our DB. These tests guard against a future refactor that
// reintroduces the dependency.

test("handleMembershipDeleted reads user + org from PAYLOAD, not pre-read row", () => {
  // The handler must extract userId from the webhook payload's
  // public_user_data.user_id (with fallback to .user_id). Looking
  // for the literal payload-access pattern; if anyone refactors to
  // a DB pre-read, this fails.
  const match = WEBHOOK_SRC.match(
    /async function handleMembershipDeleted[\s\S]*?\n\}/
  );
  assert.ok(match, "handleMembershipDeleted must exist");
  const body = match![0];

  // Must read from the payload.
  assert.ok(
    /event\.data\.public_user_data\?\.user_id/.test(body),
    "must extract userId from event.data.public_user_data.user_id (not from a DB pre-read)"
  );
  assert.ok(
    /event\.data\.organization\?\.id/.test(body),
    "must extract clerkOrgId from event.data.organization.id"
  );
});

test("handleMembershipDeleted does NOT depend on a pre-read returning a row", () => {
  // The PR #71 bug was: `if (existing) { captureServerEvent(...) }`
  // — silently skipping the event when `existing` was null.
  // Guard against that exact pattern returning. The handler may
  // still optionally check the DB for the org row to map clerkOrgId
  // → dbOrgId (consistent with how other events refer to orgs), but
  // it must NOT gate the captureServerEvent call on
  // OrganizationMembership.findUnique().
  const match = WEBHOOK_SRC.match(
    /async function handleMembershipDeleted[\s\S]*?\n\}/
  );
  assert.ok(match, "handleMembershipDeleted must exist");
  const body = match![0];

  // The PR #71 pre-read used `organizationMembership.findUnique`.
  // Forbid that specifically in this handler.
  assert.ok(
    !/organizationMembership\.findUnique/.test(body),
    "handleMembershipDeleted must NOT pre-read OrganizationMembership (analytics shouldn't depend on row existence)"
  );

  // captureServerEvent for org_member_removed must fire conditioned
  // on having user + org from the PAYLOAD, not on existing being
  // non-null.
  assert.ok(
    /if \(userIdFromPayload && \(dbOrgId \|\| clerkOrgId\)\)/.test(body),
    "captureServerEvent must be gated on payload-derived fields, not a DB pre-read"
  );
});

test("webhook POST handler calls flushAnalyticsServer before returning", () => {
  // v0.18 PR #73 regression guard. Vercel serverless freezes the
  // JS event loop after the lambda's HTTP response returns. PostHog-
  // node's 10s flushInterval timer can't tick while frozen, so any
  // queued events sit in memory until the lambda dies (events lost).
  // The bug surfaced as org_member_removed silently dropping.
  // The fix: every webhook POST MUST flush PostHog before
  // returning so the in-flight HTTP send completes inside the
  // lambda's still-alive window.
  assert.ok(
    WEBHOOK_SRC.includes("flushAnalyticsServer"),
    "webhook handler must import + invoke flushAnalyticsServer"
  );
  // The flush must happen INSIDE the POST handler BEFORE the
  // Response.json({ received: true }) return. We check the order
  // by matching the awaited flush directly above the response.
  const postMatch = WEBHOOK_SRC.match(
    /export async function POST[\s\S]*?\n\}/
  );
  assert.ok(postMatch, "POST handler must exist");
  const postBody = postMatch![0];
  // Order check: flushAnalyticsServer call must precede the return.
  const flushIdx = postBody.indexOf("await flushAnalyticsServer");
  const returnIdx = postBody.indexOf(
    `Response.json({ received: true })`
  );
  assert.ok(flushIdx > 0, "POST handler must await flushAnalyticsServer");
  assert.ok(returnIdx > 0, "POST handler must return Response.json with received");
  assert.ok(
    flushIdx < returnIdx,
    "flushAnalyticsServer MUST be called before the response is returned"
  );
});

test("handleMembershipDeleted surfaces missing-payload-fields to Sentry", () => {
  // Belt-and-suspenders against the silent-skip failure mode.
  // If the webhook payload genuinely doesn't carry user/org (which
  // shouldn't happen but the original bug taught us to instrument),
  // Sentry.captureMessage must surface it. Without this, a payload-
  // shape change from Clerk would silently kill the event again.
  const match = WEBHOOK_SRC.match(
    /async function handleMembershipDeleted[\s\S]*?\n\}/
  );
  assert.ok(match, "handleMembershipDeleted must exist");
  const body = match![0];

  assert.ok(
    /Sentry\.captureMessage/.test(body),
    "handleMembershipDeleted must Sentry.captureMessage when required payload fields are missing"
  );
  assert.ok(
    /org_member_removed skipped/.test(body),
    "Sentry message must mention org_member_removed for findability"
  );
});
