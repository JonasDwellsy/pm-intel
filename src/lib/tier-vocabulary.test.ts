import test from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { tierFromSearch } from "./report/confidence-tier";

// The consumer report tier was called "Ranked" until it collided with the copy
// this product deliberately does NOT say. Scorecards never surface a rank or a
// percentile (PR #132 removed exactly that leak), and a badge reading
// "RANKED · HIGH CONFIDENCE" sitting above that copy reads as a promise of a
// number the report never prints. The tier is now "Scored".
//
// This guard exists because the word came back three times during the rank-
// promise cleanup, each time in a different surface — a string, a prop, and
// page metadata — and each was caught by a person rather than a test.

function grep(pattern: string): string[] {
  try {
    return execFileSync(
      "grep",
      ["-rIn", "--include=*.ts", "--include=*.tsx", "-E", pattern, "src"],
      { encoding: "utf8" }
    ).trim().split("\n").filter(Boolean);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 1) return [];
    throw new Error(
      `grep failed (exit ${status ?? "?"}) for /${pattern}/ — the guard could ` +
        `not run, so treat this as a failure rather than a clean result`
    );
  }
}

test("the guard can see the codebase (positive control)", () => {
  assert.ok(
    grep("tierFromSearch").length > 0,
    "grep found nothing — every absence assertion below would be vacuous"
  );
});

test("the scored tier is labelled Scored, and the badge reads it from there", () => {
  const t = tierFromSearch({ tier: "ranked", t12Listings: 400 } as never);
  assert.equal(t.label, "Scored");
  // The badge must not carry its own copy of the word; that duplication is how
  // a rename leaves "Scored" and "Ranked" on screen at the same time.
  const badge = grep('"Ranked ?·|`Ranked').filter((l) =>
    l.startsWith("src/components/report/ConfidenceBadge.tsx:")
  );
  assert.deepEqual(badge, [], "ConfidenceBadge hardcodes the tier label again");
});

test("no consumer-funnel surface tells a buyer we rank operators", () => {
  // Scoped to the funnel: /methodology documents a separate Ranked/Dormant/
  // Not eligible state taxonomy, and internal comments about metrics being
  // "context, not ranked" are a different subject entirely.
  const hits = grep("to rank|not ranked|reliable rank|Ranked ·").filter(
    (l) =>
      (l.startsWith("src/components/report/") ||
        l.startsWith("src/lib/report/") ||
        l.startsWith("src/components/scorecard/")) &&
      !l.startsWith("src/lib/tier-vocabulary.test.ts:")
  );
  assert.deepEqual(
    hits,
    [],
    `the funnel still says we rank operators — the tier is "Scored" and the ` +
      `report never prints a rank:\n${hits.join("\n")}`
  );
});
