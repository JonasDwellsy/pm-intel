import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { clientAdvisoryEnabled } from "@/lib/client-advisory-feature";

test("Client Advisory fails closed unless its dedicated flag is exactly 1", () => {
  assert.equal(clientAdvisoryEnabled(undefined), false);
  assert.equal(clientAdvisoryEnabled(""), false);
  assert.equal(clientAdvisoryEnabled("true"), false);
  assert.equal(clientAdvisoryEnabled("0"), false);
  assert.equal(clientAdvisoryEnabled("1"), true);
});

test("Client Advisory pages and transactional APIs gate before doing work", async () => {
  const surfaces = [
    ["src/app/report/page.tsx", "await searchParams"],
    ["src/app/report/account/page.tsx", "await searchParams"],
    ["src/app/report/r/[slug]/page.tsx", "await params"],
    ["src/app/api/stripe/checkout/route.ts", "await req.json()"],
    ["src/app/api/report/portal/route.ts", "stripeConfigured()"],
    ["src/app/api/report/[slug]/pdf/route.tsx", "await params"],
  ] as const;

  for (const [path, firstWork] of surfaces) {
    const source = await readFile(path, "utf8");
    const gate = source.indexOf("if (!clientAdvisoryEnabled())");
    const work = source.indexOf(firstWork);

    assert.notEqual(gate, -1, `${path} must use the Client Advisory gate`);
    assert.notEqual(work, -1, `${path} must retain its work boundary`);
    assert.ok(gate < work, `${path} must fail closed before doing work`);
  }
});

test("Stripe webhooks remain active while Client Advisory is hidden", async () => {
  const source = await readFile("src/app/api/stripe/webhook/route.ts", "utf8");
  assert.doesNotMatch(source, /clientAdvisoryEnabled/);
});
