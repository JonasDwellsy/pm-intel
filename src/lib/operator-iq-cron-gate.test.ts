import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { operatorIqSchedulerEnabled } from "@/lib/operator-iq/feature";

const operatorCronRoutes = [
  "src/app/api/cron/watch-list-digest/route.ts",
  "src/app/api/cron/brief-digest/route.ts",
] as const;

test("Operator IQ scheduling fails closed unless its dedicated flag is exactly 1", () => {
  assert.equal(operatorIqSchedulerEnabled(undefined), false);
  assert.equal(operatorIqSchedulerEnabled(""), false);
  assert.equal(operatorIqSchedulerEnabled("true"), false);
  assert.equal(operatorIqSchedulerEnabled("0"), false);
  assert.equal(operatorIqSchedulerEnabled("1"), true);
});

test("both Operator IQ cron routes authenticate before checking the scheduler gate", async () => {
  for (const routePath of operatorCronRoutes) {
    const source = await readFile(routePath, "utf8");
    const authentication = source.indexOf("if (!authorized(req))");
    const schedulerGate = source.indexOf("if (!operatorIqSchedulerEnabled())");
    const scheduledWork = source.indexOf("try {");

    assert.notEqual(authentication, -1, `${routePath} must authenticate cron requests`);
    assert.notEqual(schedulerGate, -1, `${routePath} must fail closed on its scheduler gate`);
    assert.notEqual(scheduledWork, -1, `${routePath} must retain its scheduled work boundary`);
    assert.ok(authentication < schedulerGate, `${routePath} must authenticate before revealing gate state`);
    assert.ok(schedulerGate < scheduledWork, `${routePath} must gate before starting scheduled work`);
  }
});

test("both Operator IQ schedules remain unchanged", async () => {
  const source = await readFile("vercel.json", "utf8");
  const config = JSON.parse(source) as {
    crons: Array<{ path: string; schedule: string }>;
  };

  assert.deepEqual(config.crons, [
    { path: "/api/cron/watch-list-digest", schedule: "0 13 * * *" },
    { path: "/api/cron/brief-digest", schedule: "0 14 * * *" },
  ]);
});

test("the admin digest preview remains independent of scheduled delivery", async () => {
  const source = await readFile("src/app/admin/digests/actions.ts", "utf8");

  assert.match(source, /runDigest\(\{ mode: "send", previewEmail: email \}\)/);
  assert.doesNotMatch(source, /operatorIqSchedulerEnabled/);
});
