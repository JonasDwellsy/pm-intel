import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The market pass and the $19/mo subscription were removed across 18 files.
// A single surviving reference is how a dead consumer grant comes back — and
// the subscription's grant path unlocked all 44 markets, so this is a security
// guard, not tidiness.
//
// Grep over src/ rather than a type check, because the dangerous leftovers are
// strings in metadata and Prisma model names, which typecheck fine.

function grep(pattern: string, opts: { ignoreCase?: boolean } = {}): string[] {
  const flags = ["-rIn", "--include=*.ts", "--include=*.tsx"];
  if (opts.ignoreCase) flags.push("-i");
  flags.push("-E", pattern, "src");
  try {
    const out = execFileSync("grep", flags, { encoding: "utf8" });
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

// A grep hit's line content, stripped of grep's own "path:line:" prefix
// (paths here never contain ":", so the first two colons are always the
// separators grep inserted).
function contentOf(hit: string): string {
  const m = hit.match(/^[^:]+:\d+:(.*)$/);
  return m ? m[1] : hit;
}

// A price string or "market pass" copy is fine to survive in an explanatory
// `//` comment (e.g. products.ts's "WHY NO MARKET PASS" note) — those are
// exactly the kind of history this guard should NOT flag. It's only a defect
// when it's live: JSX prose, a string literal, a template string. This is a
// line-prefix heuristic, not a parser, but it's sufficient for this repo's
// comment style (checked against every current hit below).
function isCommentLine(hit: string): boolean {
  return /^\s*(\/\/|\/\*|\*)/.test(contentOf(hit));
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

// The two tests above are grep-over-src, which can't see JSX prose (findings
// come back as element children, not string literals matching a clean
// pattern) or .env.example (not under src/ at all, and not a .ts/.tsx file).
// Both were exactly how the removed SKUs almost came back: the /report
// landing page still advertised the $29/$49 prices and the whole-market
// pass, and .env.example still told whoever provisions Stripe to create a
// $19/mo recurring Price.

test(".env.example documents the two current SKUs, not the removed ones", () => {
  const content = readFileSync(".env.example", "utf8");
  assert.ok(
    !content.includes("STRIPE_PRICE_MARKET_PASS"),
    ".env.example still declares STRIPE_PRICE_MARKET_PASS — a removed SKU's price var"
  );
  assert.ok(
    !content.includes("STRIPE_PRICE_SUBSCRIPTION"),
    ".env.example still declares STRIPE_PRICE_SUBSCRIPTION — a removed SKU's price var"
  );
  assert.ok(
    content.includes("STRIPE_PRICE_THREE_PACK"),
    ".env.example is missing STRIPE_PRICE_THREE_PACK — the $299 SKU's checkout throws without it"
  );
});

test("no live price string for a removed SKU, or market-pass copy, outside comments", () => {
  // Word/price-boundary match: "\\$(29|49|19)\\b" requires "$" immediately
  // before the digits AND a non-digit (or end of token) right after, so it
  // does not fire on "$149" or "$299" (verified below) — a bare substring
  // match would, since both contain "29" as their last two digits.
  const hits = grep('\\$(29|49|19)\\b|market pass', { ignoreCase: true }).filter(
    (l) => !l.startsWith("src/lib/billing/no-removed-skus.test.ts") && !isCommentLine(l)
  );
  assert.deepEqual(
    hits,
    [],
    `live $29/$49/$19 price string or "market pass" copy outside a comment:\n${hits.join("\n")}`
  );
});

test("the price-boundary pattern does not false-positive on $149/$299 (positive control)", () => {
  const falsePositives = ["$149", "$299", 'price="$149"', 'price="$299"'].filter((s) =>
    /\$(29|49|19)\b/.test(s)
  );
  assert.deepEqual(
    falsePositives,
    [],
    `the price guard's pattern would wrongly flag legitimate prices: ${falsePositives.join(", ")}`
  );
});
