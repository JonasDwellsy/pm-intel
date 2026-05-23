// v0.18 (PR #71, Phase 3) — Behavior tests for the email-domain
// extractor. Unlike most of our other auth/store tests (which are
// source-level contracts), these are real input-output tests since
// the function is pure with no Prisma or Clerk dependencies.

import test from "node:test";
import { strict as assert } from "node:assert";
import { extractEmailDomain } from "./email-domain";

test("extractEmailDomain — happy path returns @domain.com", () => {
  assert.equal(extractEmailDomain("alice@dwellsy.com"), "@dwellsy.com");
  assert.equal(extractEmailDomain("bob@example.org"), "@example.org");
  assert.equal(extractEmailDomain("c@a.io"), "@a.io");
});

test("extractEmailDomain — normalises case to lowercase", () => {
  // PII guardrail: aggregating "@DWELLSY.COM" and "@dwellsy.com"
  // as separate buckets would split metrics + (more importantly)
  // could leak the raw case the user typed.
  assert.equal(extractEmailDomain("Alice@DWELLSY.COM"), "@dwellsy.com");
  assert.equal(extractEmailDomain("ALICE@Example.IO"), "@example.io");
});

test("extractEmailDomain — handles multiple @ symbols (last wins)", () => {
  // Some legal address formats have multiple @s. The routing
  // domain is always the portion after the LAST @ — match that
  // convention.
  assert.equal(
    extractEmailDomain("weird@user@dwellsy.com"),
    "@dwellsy.com"
  );
});

test("extractEmailDomain — trims surrounding whitespace", () => {
  assert.equal(extractEmailDomain("  alice@dwellsy.com  "), "@dwellsy.com");
  assert.equal(extractEmailDomain("\talice@dwellsy.com\n"), "@dwellsy.com");
});

test("extractEmailDomain — collapses unknown inputs to (unknown) bucket", () => {
  // Goal: never leak the original string when we can't parse it.
  // PostHog still gets a row tagged "(unknown)" so we can see
  // there was a problem without leaking PII.
  assert.equal(extractEmailDomain(""), "(unknown)");
  assert.equal(extractEmailDomain("   "), "(unknown)");
  assert.equal(extractEmailDomain(null), "(unknown)");
  assert.equal(extractEmailDomain(undefined), "(unknown)");
  assert.equal(extractEmailDomain("no-at-sign"), "(unknown)");
  assert.equal(extractEmailDomain("trailing@"), "(unknown)");
  // Non-string defends against accidental cast-through:
  assert.equal(extractEmailDomain(123 as unknown as string), "(unknown)");
});

test("extractEmailDomain — preserves the leading @ in the return value", () => {
  // Visual cue that the value is a domain, not a free-form string.
  // Also catches an accidental regression where someone strips
  // the @ for "cleanliness" and ends up with bare domain strings
  // that look like free-text in dashboards.
  const result = extractEmailDomain("alice@dwellsy.com");
  assert.ok(result.startsWith("@"), `expected leading @, got: ${result}`);
});

test("extractEmailDomain — never returns the local part", () => {
  // SECURITY-CRITICAL regression guard. If anyone refactors this
  // function in a way that accidentally includes the local part
  // ("alice" in "alice@dwellsy.com"), this catches it.
  const inputs = [
    "alice@dwellsy.com",
    "bob.smith@example.org",
    "very-long-prefix-with-symbols+test@somewhere.io",
    "x@a.b",
  ];
  for (const email of inputs) {
    const result = extractEmailDomain(email);
    const localPart = email.split("@")[0]!.toLowerCase();
    assert.ok(
      !result.includes(localPart),
      `extractEmailDomain leaked local part "${localPart}" in output "${result}"`
    );
  }
});
