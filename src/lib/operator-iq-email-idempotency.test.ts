import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DIGEST_KIND,
  digestKindFromRunId,
  digestRunId,
  summarizeDigestRun,
} from "@/lib/email/digest-delivery-ledger";

test("digest run totals reconcile every attempted terminal outcome", () => {
  assert.deepEqual(summarizeDigestRun(["sent", "sent", "failed", "uncertain"], 3), {
    attempted: 4,
    sent: 2,
    failed: 1,
    uncertain: 1,
    claimed: 0,
    skipped: 3,
    status: "completed_with_errors",
  });
});

test("a clean digest run reaches a completed final state", () => {
  assert.deepEqual(summarizeDigestRun(["sent", "sent"], 1), {
    attempted: 2,
    sent: 2,
    failed: 0,
    uncertain: 0,
    claimed: 0,
    skipped: 1,
    status: "completed",
  });
});

test("an orchestration error records a final error state even before a send", () => {
  assert.equal(summarizeDigestRun([], 0, true).status, "completed_with_errors");
});

test("existing tables provide a deterministic cross-run delivery boundary", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const snapshot = new Date("2026-08-01T00:00:00.000Z");
  const watchRun = digestRunId(DIGEST_KIND.watchList, snapshot);
  const briefRun = digestRunId(DIGEST_KIND.marketBrief, snapshot);

  assert.notEqual(watchRun, briefRun);
  assert.equal(digestKindFromRunId(watchRun), DIGEST_KIND.watchList);
  assert.equal(digestKindFromRunId(briefRun), DIGEST_KIND.marketBrief);
  assert.match(
    schema,
    /model WatchListDigestSend[\s\S]*@@unique\(\[runId, userId\]\)/,
  );
});

test("both scheduled digest paths claim before sending and always finalize", async () => {
  for (const path of [
    "src/lib/watch-list/digest-run.ts",
    "src/lib/briefs-digest/run.ts",
  ]) {
    const source = await readFile(path, "utf8");
    const claim = source.indexOf("claimDigestDelivery(");
    const send = source.indexOf("sendEmail(", claim);
    assert.ok(claim >= 0, `${path} must claim a durable delivery`);
    assert.ok(send > claim, `${path} must claim before calling SendGrid`);
    assert.match(source, /finally\s*{[\s\S]*finalizeDigestRun\(/);
  }
});

test("admin reporting exposes reconciled attempts and every terminal outcome", async () => {
  const source = await readFile("src/app/admin/digests/page.tsx", "utf8");
  assert.match(source, /r\.sends\.length/);
  for (const status of ["sent", "failed", "uncertain", "claimed"]) {
    assert.match(source, new RegExp(`send\\.status === "${status}"`));
  }
});

test("the idempotency revision requires no schema or migration change", async () => {
  const helper = await readFile("src/lib/email/digest-delivery-ledger.ts", "utf8");
  assert.match(helper, /prisma\.watchListDigestRun\.upsert/);
  assert.match(helper, /prisma\.watchListDigestSend\.create/);
  assert.doesNotMatch(helper, /operatorDigestRun|operatorDigestDelivery/);
});
