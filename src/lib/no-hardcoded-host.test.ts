import test from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { CANONICAL_HOST } from "./seo";

// The public host has now moved twice — bare iq.dwellsy.com → intel (PR #297)
// → operators — and each move meant hunting the literal through PDF citations,
// page footers and OG images, because nine files each owned their own copy.
//
// `CANONICAL_HOST` in seo.ts is now the single source. This guard keeps it
// that way: production source may not hardcode an app host. Tests may (their
// literals ARE the expectation), and seo.ts owns the constant and documents
// the history, so both are exempt.
//
// Deliberately NOT exempt-by-pattern: portfolio.iq.dwellsy.com in layout.tsx
// is a different product's host and legitimately hardcoded, so this matches
// only the two app hosts by name rather than anything *.iq.dwellsy.com.

/** grep, treating exit 1 (no matches) as success and anything else as a real
 *  failure — a broken invocation must not read as a clean result. */
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

const isExempt = (line: string) =>
  line.startsWith("src/lib/seo.ts:") ||
  line.startsWith("src/lib/no-hardcoded-host.test.ts:") ||
  /^[^:]*\.test\.tsx?:/.test(line);

test("the guard can actually see the codebase (positive control)", () => {
  // Every assertion below is an ABSENCE, so all of them pass vacuously if grep
  // searches nothing — a wrong CWD, a moved src/. Anchor to something that
  // must exist.
  assert.ok(
    grep("CANONICAL_HOST").length > 0,
    "grep found no reference to CANONICAL_HOST — the guard is searching " +
      "nothing, so every absence assertion here is vacuous"
  );
});

test("production source does not hardcode the canonical host", () => {
  const hits = grep(CANONICAL_HOST.replace(/\./g, "\\.")).filter((l) => !isExempt(l));
  assert.deepEqual(
    hits,
    [],
    `${CANONICAL_HOST} is hardcoded outside seo.ts. Import CANONICAL_HOST (or ` +
      `CANONICAL_ORIGIN) instead, so the next host move is one line:\n${hits.join("\n")}`
  );
});

test("the retired host has not crept back into production source", () => {
  // intel.iq.dwellsy.com now 308-redirects to operators. A link still pointing
  // there works, but it costs a hop and it is stale in a PDF a buyer keeps.
  // No lookbehind: this grep's -E is POSIX ERE and exits 2 on `(?<!...)`,
  // which the wrapper above correctly reports as a failure. Filter in JS.
  const hits = grep("intel\\.iq\\.dwellsy\\.com")
    .filter((l) => !isExempt(l))
    .filter((l) => !l.includes("clerk.intel.iq.dwellsy.com"));
  assert.deepEqual(hits, [], `stale host reference:\n${hits.join("\n")}`);
});

test("Clerk's frontend-API host is left alone", () => {
  // clerk.intel.iq.dwellsy.com is shared by every Dwellsy IQ app on the Clerk
  // instance and is a separate DNS record from the app host, so the
  // intel → operators redirect does not touch it. If a future sweep "fixes"
  // this to match CANONICAL_HOST, authentication breaks for all of them.
  const seo = grep("clerk\\.intel\\.iq\\.dwellsy\\.com");
  assert.ok(
    seo.some((l) => l.startsWith("src/lib/seo.ts:")),
    "seo.ts no longer documents that Clerk stays on clerk.intel.iq.dwellsy.com " +
      "— that note is the reason nobody rewrites it"
  );
});
