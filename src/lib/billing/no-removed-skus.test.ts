import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// The market pass and the $19/mo subscription were removed across 18 files.
// A single surviving reference is how a dead consumer grant comes back — and
// the subscription's grant path unlocked all 44 markets, so this is a security
// guard, not tidiness.
//
// Grep over src/ rather than a type check, because the dangerous leftovers are
// strings in metadata and Prisma model names, which typecheck fine.

function grep(pattern: string): string[] {
  try {
    const out = execFileSync(
      "grep",
      ["-rIn", "--include=*.ts", "--include=*.tsx", "-E", pattern, "src"],
      { encoding: "utf8" }
    );
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return []; // grep exits 1 when there are no matches
  }
}

test("no code references the removed Prisma models", () => {
  // Allow this file itself, which necessarily names them.
  const hits = grep("prisma\\.(marketPass|subscription)\\b").filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead model access:\n${hits.join("\n")}`);
});

test("no code references the removed SKU kinds", () => {
  const hits = grep('"(market_pass|subscription)"').filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead SKU literal:\n${hits.join("\n")}`);
});

test("no code references the removed analytics events", () => {
  const hits = grep("(market_pass_purchased|subscription_started|subscription_canceled)").filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead analytics event:\n${hits.join("\n")}`);
});

test("MARKET_PASS_DAYS is gone", () => {
  const hits = grep("MARKET_PASS_DAYS").filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts")
  );
  assert.deepEqual(hits, [], `dead constant:\n${hits.join("\n")}`);
});
