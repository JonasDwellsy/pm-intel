import test from "node:test";
import { strict as assert } from "node:assert";
import { buildBriefDigestEmail, type BriefDigestInput } from "./compose";

const base: BriefDigestInput = {
  recipientFirstName: "Jo",
  monthLabel: "July 2026",
  nationalUrl: "https://x/briefs/national",
  nationalHeadline: null,
  national: null,
  markets: [],
  unsubscribeUrl: "https://x/api/brief-digest/unsubscribe?u=U&t=T",
};

test("returns null when there is nothing to send", () => {
  assert.equal(buildBriefDigestEmail(base), null);
});

test("national headline alone produces an email", () => {
  const e = buildBriefDigestEmail({ ...base, nationalHeadline: "Rents cooled nationally." })!;
  assert.ok(e);
  assert.match(e.text, /Rents cooled nationally\./);
  assert.match(e.html, /Rents cooled nationally\./);
  assert.match(e.subject, /July 2026/);
  assert.match(e.text, /Unsubscribe: https:\/\/x\/api\/brief-digest\/unsubscribe/);
});

test("count phrase pluralizes and omits zero terms", () => {
  const e = buildBriefDigestEmail({
    ...base,
    national: { newEntrants: 2, ratingGains: 1, ratingLosses: 0, cohortMoves: 3 },
  })!;
  assert.match(e.text, /2 new entrants · 1 rating gain · 3 reclassifications/);
  assert.doesNotMatch(e.text, /rating loss/);
});

test("markets are listed with links and change phrases", () => {
  const e = buildBriefDigestEmail({
    ...base,
    nationalHeadline: "National read.",
    markets: [
      { marketName: "Nashville", briefUrl: "https://x/n/brief", newEntrants: 1, ratingGains: 0, ratingLosses: 1, cohortMoves: 0 },
    ],
  })!;
  assert.match(e.text, /- Nashville: 1 new entrant · 1 rating loss — https:\/\/x\/n\/brief/);
  assert.match(e.html, /href="https:\/\/x\/n\/brief"/);
  assert.match(e.html, /Nashville/);
});

test("markets with no change still render a phrase when included", () => {
  const e = buildBriefDigestEmail({
    ...base,
    nationalHeadline: "x",
    markets: [{ marketName: "Boise", briefUrl: "https://x/b", newEntrants: 0, ratingGains: 0, ratingLosses: 0, cohortMoves: 0 }],
  })!;
  assert.match(e.text, /Boise: no material change/);
});
