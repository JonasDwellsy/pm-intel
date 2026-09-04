import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// ScaleFitSection's `showPackOffer` prop is what gates the $299 three-report
// pack pitch under the peer table. It defaults to false and — per the prop's
// own doc comment — is meant to stay off everywhere except the consumer
// single-report view: never on the B2B scorecard, /sample, or the PDF. But
// nothing currently enforces that containment; it is true only because no
// caller happens to pass it yet. The very next ScorecardBody edit that adds
// `showPackOffer` to make one more surface "consistent" would put the $299
// offer in front of a B2B buyer or a logged-out /sample visitor with no
// warning.
//
// Grep over src/ rather than a render test — ScaleFitSection needs a full
// peer-table prop graph to mount (see scorecard-peer-table-scroll.test.ts's
// same reasoning for the same file), and the fact worth pinning is
// structural: no JSX call site sets this prop.

const FILE = "src/components/scorecard/redesign/ScaleFitSection.tsx";
const SELF = "src/lib/scale-fit-pack-offer-containment.test.ts";

function grep(pattern: string): string[] {
  const flags = ["-rIn", "--include=*.ts", "--include=*.tsx", "-E", pattern, "src"];
  try {
    const out = execFileSync("grep", flags, { encoding: "utf8" });
    return out.trim().split("\n").filter(Boolean);
  } catch (e) {
    // grep's exit codes: 1 = no matches (our success case for the absence
    // assertion below), 2 = a real failure (bad regex, missing directory).
    // Swallowing both would make this guard silently pass whenever it broke
    // — the one failure mode a guard must not have.
    const status = (e as { status?: number }).status;
    if (status === 1) return [];
    throw new Error(
      `grep failed (exit ${status ?? "?"}) for /${pattern}/ — the guard could ` +
        `not run, so treat this as a failure rather than a clean result`
    );
  }
}

test("the guard can actually see showPackOffer (positive control)", () => {
  // Every hit below is an ABSENCE assertion, so it passes vacuously if grep
  // is silently searching nothing. Anchor to the prop's own declaration in
  // ScaleFitSection.tsx, which MUST be findable.
  const hits = grep("showPackOffer");
  assert.ok(
    hits.length > 0,
    "grep found no reference to showPackOffer at all — the guard is " +
      "searching nothing, so the absence assertion below proves nothing"
  );
});

test("no caller passes showPackOffer to ScaleFitSection", () => {
  // A caller SETTING the prop writes either `showPackOffer={...}` or the
  // JSX shorthand `showPackOffer` alone — shorthand IS valid TypeScript for
  // a `boolean | undefined` prop (it's sugar for `showPackOffer={true}`), so
  // requiring a trailing "=" would miss it entirely. Grep for the bare
  // identifier instead and rely on the file-path filter, not the regex, to
  // exempt non-caller mentions: the prop's own file (its interface field
  // `showPackOffer?: boolean;`, its destructure default
  // `showPackOffer = false`, and its usage `{showPackOffer && ...}`) and
  // this test file (whose comments and grep patterns say the name).
  const hits = grep("showPackOffer").filter(
    (l) => !l.startsWith(`${FILE}:`) && !l.startsWith(`${SELF}:`)
  );
  assert.deepEqual(
    hits,
    [],
    `a caller now passes showPackOffer to ScaleFitSection — confirm the ` +
      `surface is the consumer single-report view (never the B2B scorecard, ` +
      `/sample, or the PDF) before updating this guard:\n${hits.join("\n")}`
  );
});
