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
