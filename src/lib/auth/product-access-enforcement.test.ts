import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Dwellsy IQ Markets premium entitlement requires the shared product assignment", () => {
  const entitlement = read("src/lib/auth/market-entitlements.server.ts");
  assert.match(entitlement, /operatorIqMemberHasProductAccess/);
  assert.match(entitlement, /if \(!await operatorIqMemberHasProductAccess\(clerkOrgId, userId\)\) return new Set<string>\(\)/);
});

test("Dwellsy IQ Markets invitations carry product metadata and a Dwellsy IQ Markets return URL", () => {
  const customer = read("src/app/organization/actions.ts");
  const internal = read("src/app/admin/organizations/actions.ts");
  for (const source of [customer, internal]) {
    assert.match(source, /publicMetadata: operatorIqInvitationPublicMetadata\(\)/);
    assert.match(source, /redirectUrl: operatorIqInvitationRedirectUrl\(\)/);
  }
});

test("the organization switcher uses the product-aware management page", () => {
  const desktop = read("src/components/layout/SiteHeader.tsx");
  const mobile = read("src/components/layout/MobileMenu.tsx");
  for (const source of [desktop, mobile]) {
    assert.match(source, /organizationProfileMode="navigation"/);
    assert.match(source, /organizationProfileUrl="\/organization"/);
  }
});
