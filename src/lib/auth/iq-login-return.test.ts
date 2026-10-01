import assert from "node:assert/strict";
import test from "node:test";
import { iqLoginLink, iqLoginReturn } from "./iq-login-return";

test("preserves product, invite, market and session-sync context", () => {
  for (const path of ["/app?market=cbsa-41860", "/invitations/accept?organization=org_test", "/apply", "/admin/reviews"]) {
    const url = new URL(iqLoginReturn({ redirect_url: `https://concessions.iq.dwellsy.com${path}` })!);
    assert.equal(url.origin, "https://concessions.iq.dwellsy.com");
    assert.equal(url.searchParams.get("__clerk_synced"), "false");
    assert.equal(url.pathname, path.split("?")[0]);
    if (path.includes("organization")) assert.equal(url.searchParams.get("organization"), "org_test");
  }
});
test("forced product return wins over initiating login page", () => {
  assert.equal(iqLoginReturn({ sign_in_force_redirect_url: "https://concessions.iq.dwellsy.com/app", redirect_url: "https://concessions.iq.dwellsy.com/sign-in" }), "https://concessions.iq.dwellsy.com/app?__clerk_synced=false");
  assert.equal(iqLoginReturn({ redirect_url: "https://concessions.iq.dwellsy.com/sign-in" }), "https://concessions.iq.dwellsy.com/app?__clerk_synced=false");
});
test("rejects untrusted returns instead of falling through to Operators", () => {
  for (const value of [undefined, ["https://concessions.iq.dwellsy.com/app"], "//evil.example", "https://concessions.iq.dwellsy.com.evil.example/app", "https://evil.example", "http://concessions.iq.dwellsy.com/app", "https://user@concessions.iq.dwellsy.com/app", "https://concessions.iq.dwellsy.com:444/app", "https://concessions.iq.dwellsy.com/app#bad", "https://concessions.iq.dwellsy.com\\@evil.example/"]) {
    assert.equal(iqLoginReturn({ redirect_url: value }), null);
  }
});
test("sign-in and sign-up links preserve the validated destination", () => {
  const destination = "https://concessions.iq.dwellsy.com/invitations/accept?organization=org_test&__clerk_synced=false";
  for (const mode of ["sign-in", "sign-up"] as const) {
    const url = new URL(iqLoginLink(mode, destination), "https://operators.iq.dwellsy.com");
    assert.equal(url.pathname, `/iq/${mode}`);
    assert.equal(url.searchParams.get("redirect_url"), destination);
  }
});
