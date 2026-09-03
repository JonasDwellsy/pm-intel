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
  } catch (e) {
    // grep's exit codes: 1 = no matches (our success case), 2 = a real
    // failure such as an unbalanced regex or a missing directory. Swallowing
    // both would make this guard silently pass whenever it broke, which is
    // the one failure mode a guard must not have.
    const status = (e as { status?: number }).status;
    if (status === 1) return [];
    throw new Error(
      `grep failed (exit ${status ?? "?"}) for /${pattern}/ — the guard could ` +
        `not run, so treat this as a failure rather than a clean result`
    );
  }
}

test("the guard can actually see the codebase (positive control)", () => {
  // Every other test here asserts an ABSENCE, so all of them pass vacuously if
  // grep silently searches nothing — a wrong CWD, a moved `src/`, or a grep
  // whose exit code for "no such directory" is 1 (no files matched) rather
  // than 2. This machine's grep does exactly that, so the exit-code check
  // above cannot catch it. Anchor the suite to something that MUST be present:
  // if this finds nothing, the absence assertions below prove nothing either.
  const hits = grep("single_report");
  assert.ok(
    hits.length > 0,
    "grep found no reference to the surviving SKU — the guard is searching " +
      "nothing, so every absence assertion in this file is vacuous"
  );
});

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
