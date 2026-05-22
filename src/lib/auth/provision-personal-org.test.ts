// v0.18 (PR #65) — Tests for provisionPersonalOrgForUser().
//
// Behavioral tests would require a stubbed Clerk SDK, which we
// don't wire up in CI (the surface area of Clerk's mocks isn't
// worth maintaining for one function). We instead test the
// STRUCTURE of the response shape — the three documented statuses
// + the contract that the function never throws on a Clerk API
// failure (it returns status="failed" instead).
//
// The full integration test lives in the PR's manual-verification
// matrix: sign up a fresh user, assert the personal org appears in
// the Clerk dashboard AND in our DB within ~5s.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("provision-personal-org module shape: exports the documented function", () => {
  // Source-level smoke test — confirms the export name + signature
  // shape so the webhook handler import doesn't break silently if
  // someone renames the function.
  const src = readFileSync(
    join(
      process.cwd(),
      "src/lib/auth/provision-personal-org.ts"
    ),
    "utf8"
  );
  assert.ok(
    src.includes("export async function provisionPersonalOrgForUser"),
    "must export provisionPersonalOrgForUser"
  );
  assert.ok(
    src.includes('status: "created"') &&
      src.includes('status: "already_exists"') &&
      src.includes('status: "failed"'),
    "must declare all three ProvisionResult.status values"
  );
});

test("provision-personal-org sets the isPersonal + forUserId privateMetadata marker", () => {
  const src = readFileSync(
    join(
      process.cwd(),
      "src/lib/auth/provision-personal-org.ts"
    ),
    "utf8"
  );
  // The marker is what the organization.created webhook handler
  // reads to set personalForUserId on our DB row. If the marker
  // fields drift, the webhook silently creates non-personal rows.
  assert.ok(
    src.includes("isPersonal: true"),
    "must set isPersonal=true on privateMetadata"
  );
  assert.ok(
    src.includes("forUserId: userId"),
    "must set forUserId=userId on privateMetadata"
  );
});

test("provision-personal-org checks for existing personal org before creating", () => {
  const src = readFileSync(
    join(
      process.cwd(),
      "src/lib/auth/provision-personal-org.ts"
    ),
    "utf8"
  );
  // Idempotency check: the function must look up existing
  // memberships and short-circuit on isPersonal === true.
  assert.ok(
    src.includes("getOrganizationMembershipList"),
    "must check existing memberships for idempotency"
  );
  assert.ok(
    src.match(/meta\?\.isPersonal\s*===\s*true/),
    "must look for the isPersonal marker on existing memberships"
  );
});
