import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Drift guard for the homepage section order.
//
// SingleReportOffer's $149/$299 consumer price sits deliberately AFTER
// SelectEvaluateMonitor (the enterprise pitch) and BEFORE FinalCta. A price
// visible before the enterprise pitch would anchor a five-figure enterprise
// conversation against a $149 number — the whole point of the 2026-08
// reposition (see SingleReportOffer.tsx's v0.34 comment). Nothing about the
// component itself enforces this; only its position in src/app/page.tsx
// does, and that position is trivial to disturb in an unrelated homepage
// edit (moving a section up "just to see how it reads," reordering during a
// merge conflict, etc.) with no type error, lint warning, or component test
// to catch it. This is exactly the kind of failure a source-level guard
// exists for.

function src(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const PAGE = "src/app/page.tsx";

test("SingleReportOffer sits after the enterprise pitch and before the final CTA", () => {
  const s = src(PAGE);

  const enterprisePitchIdx = s.indexOf("<SelectEvaluateMonitor");
  const offerIdx = s.indexOf("<SingleReportOffer");
  const finalCtaIdx = s.indexOf("<FinalCta");

  assert.ok(
    enterprisePitchIdx !== -1,
    `expected <SelectEvaluateMonitor /> to be rendered on ${PAGE}`
  );
  assert.ok(
    offerIdx !== -1,
    `expected <SingleReportOffer /> to be rendered on ${PAGE}`
  );
  assert.ok(
    finalCtaIdx !== -1,
    `expected <FinalCta /> to be rendered on ${PAGE}`
  );

  assert.ok(
    enterprisePitchIdx < offerIdx,
    "SingleReportOffer (the $149/$299 consumer price) must render AFTER " +
      "SelectEvaluateMonitor (the enterprise pitch) — a price shown before " +
      "the enterprise pitch would anchor a five-figure enterprise " +
      "conversation against $149. If this moved intentionally, it undoes " +
      "the 2026-08 homepage reposition; see SingleReportOffer.tsx's v0.34 " +
      "comment before changing the order."
  );
  assert.ok(
    offerIdx < finalCtaIdx,
    "SingleReportOffer must render BEFORE FinalCta so the consumer offer " +
      "isn't stranded after the page's closing band."
  );
});
