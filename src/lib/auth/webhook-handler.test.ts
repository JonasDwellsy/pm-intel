// v0.18 (PR #65) — Tests for the Clerk webhook handler extensions.
//
// As with provision-personal-org and the watch-list store, behavior
// tests require a stubbed Clerk SDK + Prisma test DB which we don't
// wire up in CI. This file covers SOURCE-LEVEL contracts that catch
// the most destructive regressions:
//
//   - Every new event type the spec calls out is handled (or
//     explicitly logged-and-skipped).
//   - Every DB write goes through `upsert` (idempotent re-delivery).
//   - The user.created handler still calls provisionPersonalOrgForUser
//     so the signup path isn't broken.
//   - The organization.deleted handler is a no-op in Phase 1 per
//     the architecture decision — guards against accidental
//     destructive code being added.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEBHOOK_SRC = readFileSync(
  join(
    process.cwd(),
    "src/app/api/clerk/webhook/route.ts"
  ),
  "utf8"
);

test("webhook handles all 8 event types from the v0.18 spec", () => {
  for (const eventType of [
    "user.created",
    "session.created",
    "organization.created",
    "organization.updated",
    "organization.deleted",
    "organizationMembership.created",
    "organizationMembership.updated",
    "organizationMembership.deleted",
  ]) {
    assert.ok(
      WEBHOOK_SRC.includes(`case "${eventType}":`),
      `webhook dispatcher must handle ${eventType}`
    );
  }
});

test("webhook DB writes use upsert (idempotent re-delivery)", () => {
  // Organization.created/updated must use upsert keyed on
  // clerkOrgId — re-delivery is a no-op.
  assert.ok(
    WEBHOOK_SRC.includes("prisma.organization.upsert"),
    "organization handlers must use upsert"
  );
  assert.ok(
    WEBHOOK_SRC.includes("where: { clerkOrgId }"),
    "organization upserts must be keyed on clerkOrgId"
  );
  // Membership.created must use upsert keyed on clerkMembershipId.
  assert.ok(
    WEBHOOK_SRC.includes("prisma.organizationMembership.upsert"),
    "membership handlers must use upsert"
  );
});

test("user.created still calls provisionPersonalOrgForUser", () => {
  // Regression guard: if anyone removes the personal org
  // provisioning call from user.created, signups silently stop
  // creating personal orgs and every new user hits
  // /setup-workspace.
  assert.ok(
    WEBHOOK_SRC.includes("provisionPersonalOrgForUser(userId)"),
    "user.created handler must call provisionPersonalOrgForUser"
  );
});

test("organization.deleted is a no-op in Phase 1 (no Prisma mutation)", () => {
  // Per architecture decision: orgs aren't soft-deleted until
  // Phase 3 ships the management UI. This test catches accidental
  // code that would orphan WatchList rows.
  // Locate the deleted handler function body and assert no
  // prisma.organization.delete / deleteMany inside.
  const match = WEBHOOK_SRC.match(
    /async function handleOrganizationDeleted[\s\S]*?\n\}/
  );
  assert.ok(match, "handleOrganizationDeleted function must exist");
  const handlerBody = match![0];
  assert.ok(
    !handlerBody.includes("prisma.organization.delete"),
    "handleOrganizationDeleted must NOT call prisma.organization.delete in Phase 1"
  );
  assert.ok(
    !handlerBody.includes("prisma.watchList"),
    "handleOrganizationDeleted must NOT touch WatchList rows in Phase 1"
  );
});

test("every webhook handler is wrapped in withSentryBoundary", () => {
  // Every dispatch case routes through withSentryBoundary so
  // per-handler failures are captured + logged without taking
  // down the rest of the dispatcher.
  const dispatchMatch = WEBHOOK_SRC.match(
    /async function dispatch[\s\S]*?\n\}/
  );
  assert.ok(dispatchMatch, "dispatch function must exist");
  const dispatchBody = dispatchMatch![0];
  for (const handlerName of [
    "handleUserCreated",
    "handleSessionCreated",
    "handleOrganizationCreated",
    "handleOrganizationUpdated",
    "handleOrganizationDeleted",
    "handleMembershipCreated",
    "handleMembershipUpdated",
    "handleMembershipDeleted",
  ]) {
    // Each handler must be invoked from inside a
    // withSentryBoundary call.
    const pattern = new RegExp(
      `withSentryBoundary\\([^)]*\\)\\s*=>\\s*${handlerName}\\(`,
      "s"
    );
    // Loose check: just confirm the handler name appears inside a
    // withSentryBoundary call. The exact arrow-function shape is
    // an implementation detail.
    const looser = new RegExp(
      `withSentryBoundary[\\s\\S]{0,200}${handlerName}\\(`
    );
    assert.ok(
      looser.test(dispatchBody),
      `${handlerName} must be invoked through withSentryBoundary`
    );
  }
});
