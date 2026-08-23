import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeDigestRun } from "@/lib/email/digest-delivery-ledger";

test("digest run totals reconcile every attempted terminal outcome", () => {
  assert.deepEqual(summarizeDigestRun(["sent", "sent", "failed", "uncertain"], 3), {
    attempted: 4,
    sent: 2,
    failed: 1,
    uncertain: 1,
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
    skipped: 1,
    status: "completed",
  });
});

test("an orchestration error records a final error state even before a send", () => {
  assert.equal(summarizeDigestRun([], 0, true).status, "completed_with_errors");
});

test("the migration enforces one delivery per digest, snapshot, and user", async () => {
  const migration = await readFile(
    "prisma/migrations/20260823030000_operator_digest_delivery_idempotency/migration.sql",
    "utf8",
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "OperatorDigestDelivery_digestKind_snapshotDate_userId_key" ON "OperatorDigestDelivery"\("digestKind", "snapshotDate", "userId"\)/,
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
  assert.match(source, /attemptedCount/);
  assert.match(source, /sentCount/);
  assert.match(source, /failedCount/);
  assert.match(source, /uncertainCount/);
  assert.match(source, /skippedCount/);
  assert.doesNotMatch(source, /_count:\s*{\s*select:\s*{\s*sends:/);
});
