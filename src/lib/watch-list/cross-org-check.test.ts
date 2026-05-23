// v0.18 (PR #70, Phase 2) — Source-level tests for the cross-org
// access check.
//
// Like the other store tests, the read/write paths require a real
// Postgres + Clerk session to exercise meaningfully, so this file
// covers SOURCE-LEVEL contracts only — the three-state result shape
// + the security-critical existence-leak protection.
//
// Behavioural coverage of the redirect flow ships via the manual
// verification matrix in the PR plan.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const STORE_SRC = readFileSync(
  join(process.cwd(), "src/lib/watch-list/store.ts"),
  "utf8"
);

test("WatchListAccessResult union declares all three documented states", () => {
  // The three-state model is the foundation of the existence-leak
  // protection. If anyone collapses it to a boolean or removes the
  // distinction between not_found and wrong_org, the redirect path
  // would start leaking watch-list existence to random URL guessers.
  assert.ok(
    STORE_SRC.includes('status: "found"'),
    'WatchListAccessResult must include status: "found"'
  );
  assert.ok(
    STORE_SRC.includes('status: "wrong_org"'),
    'WatchListAccessResult must include status: "wrong_org"'
  );
  assert.ok(
    STORE_SRC.includes('status: "not_found"'),
    'WatchListAccessResult must include status: "not_found"'
  );
});

test("getWatchListWithCrossOrgCheck verifies membership before returning wrong_org", () => {
  // SECURITY-CRITICAL: the function must look up
  // OrganizationMembership before returning wrong_org. Without that
  // check, any cross-org URL would trigger a redirect-with-flash,
  // leaking watch-list existence to URL guessers.
  assert.ok(
    STORE_SRC.includes("organizationMembership.findFirst"),
    "must query OrganizationMembership table"
  );
  // The query must filter by BOTH userId AND organizationId — not
  // just userId (which would return any membership) or just
  // organizationId (which would return any user's membership).
  assert.ok(
    /organizationMembership\.findFirst\([\s\S]*?userId,[\s\S]*?organizationId: row\.organizationId/.test(
      STORE_SRC
    ),
    "membership query must filter by both userId AND the watch list's organizationId"
  );
});

test("getWatchListWithCrossOrgCheck collapses null-organizationId rows to not_found", () => {
  // Legacy sentinel rows (pre-Phase-1 data) have organizationId =
  // null. They don't belong to any caller — neither the happy path
  // (no org match) nor the wrong_org path (no org to be a member
  // of). Must collapse to not_found rather than crash on the
  // membership lookup.
  assert.ok(
    /if \(!row\.organizationId\)[\s\S]*?return \{ status: "not_found" \}/.test(
      STORE_SRC
    ),
    "must explicitly handle null organizationId (legacy sentinels) as not_found"
  );
});

test("non-member callers cannot trigger wrong_org redirect (existence-leak protection)", () => {
  // The function must return not_found (not wrong_org) when the
  // caller has no membership in the watch list's owning org.
  // Re-check the source for the conditional structure that enforces
  // this. We're looking for:
  //   if (!membership) return { status: "not_found" };
  assert.ok(
    /if \(!membership\)[\s\S]*?return \{ status: "not_found" \}/.test(
      STORE_SRC
    ),
    "non-members must get not_found, not wrong_org (existence-leak protection)"
  );
});
