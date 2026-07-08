import test from "node:test";
import { strict as assert } from "node:assert";
import { buildDigest, describeChange, type DigestInput } from "./digest";
import type { OperatorChange } from "./change-detection";

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    recipientFirstName: "Sam",
    monthLabel: "June 2026",
    unsubscribeUrl: "https://iq.dwellsy.com/api/digest/unsubscribe?u=user_1&t=abc",
    scorecardBaseUrl: "https://iq.dwellsy.com",
    lists: [
      {
        watchListName: "SFR scale-ups",
        operators: [
          {
            pmSlug: "acme-chattanooga-tn",
            name: "Acme Homes",
            marketLabel: "Chattanooga",
            scorecardUrl: "https://iq.dwellsy.com/property-managers/tn/chattanooga/acme-chattanooga-tn",
            changes: [
              { type: "star", metric: "tenancy", before: "silver", after: "gold" },
              { type: "eligibility_flip", direction: "entered" },
            ] as OperatorChange[],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("returns null when there are no changes", () => {
  assert.equal(buildDigest(input({ lists: [] })), null);
  assert.equal(buildDigest(input({ lists: [{ watchListName: "Empty", operators: [] }] })), null);
});

test("subject names the month", () => {
  const email = buildDigest(input())!;
  assert.match(email.subject, /June 2026/);
});

test("html + text include operator, market, list name, and scorecard link", () => {
  const email = buildDigest(input())!;
  for (const body of [email.html, email.text]) {
    assert.match(body, /Acme Homes/);
    assert.match(body, /Chattanooga/);
    assert.match(body, /SFR scale-ups/);
  }
  assert.match(email.html, /property-managers\/tn\/chattanooga\/acme-chattanooga-tn/);
});

test("html + text include the unsubscribe link", () => {
  const email = buildDigest(input())!;
  // HTML escapes & → &amp; in the href (valid HTML; clients parse it back).
  assert.match(email.html, /api\/digest\/unsubscribe\?u=user_1&amp;t=abc/);
  // Plain-text body keeps the raw ampersand.
  assert.match(email.text, /api\/digest\/unsubscribe\?u=user_1&t=abc/);
});

test("describeChange renders each variant as human copy", () => {
  const cases: OperatorChange[] = [
    { type: "star", metric: "leaseUp", before: null, after: "gold" },
    { type: "portfolio_band", before: "Low", after: "Medium" },
    { type: "portfolio_size", before: 100, after: 130, pctChange: 0.3 },
    { type: "market_added", marketId: "nashville-tn" },
    { type: "market_dropped", marketId: "memphis-tn" },
    { type: "submarket_added", submarketSlug: "downtown" },
    { type: "submarket_dropped", submarketSlug: "midtown" },
    { type: "concession_transition", direction: "appeared", before: null, after: 0.08 },
    { type: "concession_shift", before: 0.05, after: 0.12, deltaPp: 7 },
    { type: "eligibility_flip", direction: "exited" },
  ];
  for (const c of cases) {
    const s = describeChange(c);
    assert.ok(s.length > 0, `empty copy for ${c.type}`);
  }
});
