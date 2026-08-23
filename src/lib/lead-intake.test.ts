import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isLeadBotTrapFilled,
  MAX_LEAD_REQUEST_BYTES,
  readLeadJsonBody,
} from "./lead-intake";
import { leadApiSchema } from "./lead-schema";

test("lead intake accepts bounded JSON with a compatible content type", async () => {
  const result = await readLeadJsonBody(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ownerName: "Jane" }),
    })
  );

  assert.deepEqual(result, { ok: true, value: { ownerName: "Jane" } });
});

test("lead intake rejects non-JSON and malformed bodies", async () => {
  const wrongType = await readLeadJsonBody(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    })
  );
  const malformed = await readLeadJsonBody(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json}",
    })
  );

  assert.deepEqual(wrongType, {
    ok: false,
    status: 415,
    error: "Content-Type must be application/json",
  });
  assert.deepEqual(malformed, {
    ok: false,
    status: 400,
    error: "Invalid JSON",
  });
});

test("lead intake rejects declared and streamed oversized bodies", async () => {
  const declared = await readLeadJsonBody(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_LEAD_REQUEST_BYTES + 1),
      },
      body: "{}",
    })
  );
  const streamed = await readLeadJsonBody(
    new Request("https://example.test/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "x".repeat(MAX_LEAD_REQUEST_BYTES) }),
    })
  );

  for (const result of [declared, streamed]) {
    assert.deepEqual(result, {
      ok: false,
      status: 413,
      error: "Request body is too large",
    });
  }
});

test("the hidden lead field distinguishes empty human submissions from bots", () => {
  assert.equal(isLeadBotTrapFilled(undefined), false);
  assert.equal(isLeadBotTrapFilled(""), false);
  assert.equal(isLeadBotTrapFilled("   "), false);
  assert.equal(isLeadBotTrapFilled("https://spam.example"), true);
});

test("existing API callers remain valid without the optional bot field", () => {
  const parsed = leadApiSchema.safeParse({
    propertyType: "multifamily",
    ownerName: "Jane Owner",
    ownerEmail: "jane@example.com",
  });

  assert.equal(parsed.success, true);
});

test("lead field lengths are bounded before persistence", () => {
  const parsed = leadApiSchema.safeParse({
    propertyType: "multifamily",
    ownerName: "x".repeat(121),
    ownerEmail: "jane@example.com",
  });

  assert.equal(parsed.success, false);
});

test("the lead route never copies submitted PII into logs or diagnostics", () => {
  const routeSource = readFileSync(
    new URL("../app/api/leads/route.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(routeSource, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(routeSource, /lead\.owner(?:Email|Name|Phone)/);
  assert.doesNotMatch(routeSource, /data\.(?:ownerEmail|ownerName|ownerPhone|notes).*Sentry/);
  assert.match(routeSource, /Sentry\.captureMessage\("Lead intake failed"/);
  assert.match(routeSource, /readLeadJsonBody\(req\)/);
  assert.match(routeSource, /isLeadBotTrapFilled\(data\.companyWebsite\)/);
});

test("the retained lead form sends an inaccessible bot-trap field", () => {
  const formSource = readFileSync(
    new URL("../components/leads/LeadForm.tsx", import.meta.url),
    "utf8"
  );

  assert.match(formSource, /aria-hidden="true"/);
  assert.match(formSource, /tabIndex=\{-1\}/);
  assert.match(formSource, /form\.register\("companyWebsite"\)/);
});
