import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBriefUnsubscribeHandlers } from "@/app/api/brief-digest/unsubscribe/route";
import { createDigestUnsubscribeHandlers } from "@/app/api/digest/unsubscribe/route";
import { oneClickUnsubscribeHeaders } from "@/lib/email/send";

type HandlerFactory = (deps: {
  verify: (userId: string, token: string) => boolean;
  unsubscribe: (userId: string) => Promise<void>;
}) => {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};

const factories: [string, HandlerFactory][] = [
  ["watch-list digest", createDigestUnsubscribeHandlers],
  ["market-brief digest", createBriefUnsubscribeHandlers],
];

for (const [label, createHandlers] of factories) {
  test(`${label}: GET confirms without unsubscribing`, async () => {
    const unsubscribed: string[] = [];
    const handlers = createHandlers({
      verify: (userId, token) => userId === "user_1" && token === "valid",
      unsubscribe: async (userId) => { unsubscribed.push(userId); },
    });

    const response = await handlers.GET(new Request(
      "https://intel.iq.dwellsy.com/unsubscribe?u=user_1&t=valid",
    ));

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Confirm unsubscribe/);
    assert.match(html, /<form method="post"/);
    assert.deepEqual(unsubscribed, []);
  });

  test(`${label}: signed POST unsubscribes exactly once`, async () => {
    const unsubscribed: string[] = [];
    const handlers = createHandlers({
      verify: (userId, token) => userId === "user_1" && token === "valid",
      unsubscribe: async (userId) => { unsubscribed.push(userId); },
    });

    const response = await handlers.POST(new Request(
      "https://intel.iq.dwellsy.com/unsubscribe?u=user_1&t=valid",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      },
    ));

    assert.equal(response.status, 200);
    assert.match(await response.text(), /You(?:'|&#39;)re unsubscribed/);
    assert.deepEqual(unsubscribed, ["user_1"]);
  });

  test(`${label}: invalid GET and POST never unsubscribe`, async () => {
    const unsubscribed: string[] = [];
    const handlers = createHandlers({
      verify: () => false,
      unsubscribe: async (userId) => { unsubscribed.push(userId); },
    });
    const url = "https://intel.iq.dwellsy.com/unsubscribe?u=user_1&t=invalid";

    assert.equal((await handlers.GET(new Request(url))).status, 400);
    assert.equal((await handlers.POST(new Request(url, { method: "POST" }))).status, 400);
    assert.deepEqual(unsubscribed, []);
  });
}

test("one-click headers use the signed HTTPS endpoint", () => {
  const url = "https://intel.iq.dwellsy.com/api/digest/unsubscribe?u=user_1&t=signed";
  assert.deepEqual(oneClickUnsubscribeHeaders(url), {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.equal(oneClickUnsubscribeHeaders(), undefined);
});

test("both scheduled digest send paths attach their signed unsubscribe URL", () => {
  for (const path of [
    "src/lib/watch-list/digest-run.ts",
    "src/lib/briefs-digest/run.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(
      source,
      /sendEmail\(\{[\s\S]{0,240}unsubscribeUrl,[\s\S]{0,40}\}\)/,
      `${path} must pass unsubscribeUrl through the SendGrid boundary`,
    );
  }
});
