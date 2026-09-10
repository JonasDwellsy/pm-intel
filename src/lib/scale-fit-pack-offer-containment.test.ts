import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// ScaleFitSection's `showPackOffer` prop gates the $299 three-report pack
// pitch under the peer table. It is now WIRED — but on exactly one surface:
// the consumer paid report view (/report/r/[slug]). It must never reach the
// B2B scorecard, /sample, or the PDF: those either have no consumer buyer or
// route the pitch at the wrong audience.
//
// The prop threads through ONE component (ScorecardBody), which passes it to
// ScaleFitSection, and is SET from ONE page (the consumer report page). This
// guard pins that graph: the only files outside the prop's own definition that
// may mention `showPackOffer` are those two. The next edit that adds it to
// /sample or the B2B scorecard page — the whole failure this prop's default of
// false exists to prevent — fails here instead of shipping the $299 offer to a
// logged-out visitor or a B2B buyer.
//
// Grep over src/ rather than a render test — ScaleFitSection needs a full
// peer-table prop graph to mount (see scorecard-peer-table-scroll.test.ts's
// same reasoning for the same file), and the fact worth pinning is structural:
// which call sites reference this prop.

// The prop's own file: interface field, destructure default, usage.
const DEFN = "src/components/scorecard/redesign/ScaleFitSection.tsx";
const SELF = "src/lib/scale-fit-pack-offer-containment.test.ts";
// The single threading component and the single page that sets the prop.
const BODY = "src/components/scorecard/ScorecardBody.tsx";
const REPORT_PAGE = "src/app/report/r/[slug]/page.tsx";
// Surfaces that render ScorecardBody but must NOT opt into the offer.
const SAMPLE_PAGE = "src/app/sample/page.tsx";
const B2B_PAGE =
  "src/app/property-managers/[state]/[city]/[slug]/page.tsx";

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

/** Distinct file paths (no line numbers) that grep matched. */
function filesMatching(pattern: string): string[] {
  return Array.from(
    new Set(grep(pattern).map((l) => l.slice(0, l.indexOf(":"))))
  ).sort();
}

test("the guard can actually see showPackOffer (positive control)", () => {
  // Some assertions below are ABSENCE assertions, which pass vacuously if grep
  // is silently searching nothing. Anchor to the prop's own declaration in
  // ScaleFitSection.tsx, which MUST be findable.
  const hits = grep("showPackOffer");
  assert.ok(
    hits.length > 0,
    "grep found no reference to showPackOffer at all — the guard is " +
      "searching nothing, so the absence assertions here prove nothing"
  );
});

test("only the consumer report path references showPackOffer", () => {
  // A caller SETTING the prop writes either `showPackOffer={...}` or the JSX
  // shorthand `showPackOffer` alone (sugar for `showPackOffer={true}`), so we
  // grep the bare identifier and reason about FILES, not lines. The only files
  // allowed to name it are the prop's definition (ScaleFitSection), this test,
  // the single threading component (ScorecardBody), and the single page that
  // sets it (the consumer report page). Anything else is the offer escaping
  // its one intended surface.
  const allowed = [DEFN, SELF, BODY, REPORT_PAGE].sort();
  const actual = filesMatching("showPackOffer");
  assert.deepEqual(
    actual,
    allowed,
    `showPackOffer is referenced by an unexpected file. It may only be set on ` +
      `the consumer paid report view (${REPORT_PAGE}) and threaded through ` +
      `${BODY} — never the B2B scorecard, /sample, or the PDF. If you are ` +
      `adding a legitimate consumer surface, extend this allow-list ` +
      `deliberately:\nexpected ${JSON.stringify(allowed)}\nactual   ${JSON.stringify(actual)}`
  );
});

test("the consumer report page still wires the offer on (drift guard)", () => {
  // The prop's whole point is to be live on the paid report. If a refactor
  // drops the `showPackOffer` pass-through from the report page, the offer
  // silently disappears with no other test noticing — pin it here.
  const onReportPage = grep("showPackOffer").some((l) =>
    l.startsWith(`${REPORT_PAGE}:`)
  );
  assert.ok(
    onReportPage,
    `${REPORT_PAGE} no longer passes showPackOffer — the $299 pack offer has ` +
      `silently dropped off the consumer paid report view`
  );
});

test("neither /sample nor the B2B scorecard opts into the offer", () => {
  // Belt-and-suspenders with a targeted message: these two pages render the
  // SAME ScorecardBody as the paid report (single-source), so they are the
  // exact places a careless "make it consistent" edit would add the prop.
  for (const page of [SAMPLE_PAGE, B2B_PAGE]) {
    const leaked = grep("showPackOffer").filter((l) => l.startsWith(`${page}:`));
    assert.deepEqual(
      leaked,
      [],
      `${page} passes showPackOffer — the $299 three-pack offer must not show ` +
        `on the ${page === SAMPLE_PAGE ? "public marketing sample" : "B2B scorecard"}:\n${leaked.join("\n")}`
    );
  }
});
