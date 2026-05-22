// PR #52 — structural contract test for the eyebrow → headline gap.
//
// Background: PR #47 and PR #51 both shipped utility-class tweaks
// (`mt-3` / `mt-3.5`) on homepage headlines trying to set the gap
// below the eyebrow. Both were silent no-ops because `.dq-h1` and
// `.dq-h2` carry `margin: 0` as unlayered CSS, which beats Tailwind's
// layered `mt-*` utilities on specificity. The fix is to put the gap
// on `.dq-eyebrow`'s own `margin-bottom` and remove the dead utility
// classes — and to lock that in with this test so the same class of
// mistake is harder to repeat.
//
// Ideal test shape would be a real DOM render under Playwright or
// Vitest+DOM asserting a baseline-to-baseline gap of ~14px for every
// `<p class="dq-eyebrow">` + adjacent headline pair. We don't have
// that infrastructure wired into `npm run test:buy-box` yet, so this
// is a CSS-source contract test: it reads globals.css, parses out
// the three rules that own the eyebrow → headline contract, and
// asserts their declarations match the documented intent.
//
// What this catches:
//   - Someone reverts `margin-bottom: 0.875rem` on `.dq-eyebrow`.
//   - Someone adds `margin-top: <anything>` to `.dq-h1` or `.dq-h2`
//     (which would fight the eyebrow's margin-bottom).
//
// What this does NOT catch:
//   - A new wrapper component that hides the eyebrow inside a
//     container with its own `mb-*` utility (unlayered .dq-eyebrow
//     still wins, but layout-collapse edge cases could change the
//     visual gap). Manual smoke covers that.

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GLOBALS_CSS_PATH = join(process.cwd(), "src/app/globals.css");

/** Extract the body (declarations between the opening { and the
 *  matching }) of the first rule whose selector exactly matches
 *  `selector`. Naive — assumes the rule is flat (no nesting) which
 *  is true for the three rules under test. */
function ruleBody(css: string, selector: string): string {
  // Match `<selector>` at line start, then everything up to the
  // first `}`. The `m` flag makes `^` match per-line. The lazy
  // `[^}]*` is safe because none of the dq-* rules use nested CSS.
  const re = new RegExp(
    `^\\${selector}\\s*\\{([^}]*)\\}`.replace(/^/, "^"),
    "m"
  );
  const match = css.match(re);
  if (!match) {
    throw new Error(`Couldn't find rule matching "${selector}" in globals.css`);
  }
  return match[1];
}

const css = readFileSync(GLOBALS_CSS_PATH, "utf8");

test(".dq-eyebrow declares margin-bottom: 0.875rem (single source of truth for the gap)", () => {
  const body = ruleBody(css, ".dq-eyebrow");
  // The exact value matters — the pillar-card cadence is 14px (mb-3.5
  // in Tailwind = 0.875rem). Drifting to a different value would
  // detune every eyebrow on the site.
  assert.match(
    body,
    /margin-bottom:\s*0\.875rem/,
    `.dq-eyebrow must declare margin-bottom: 0.875rem — found body: ${body}`
  );
});

test(".dq-h1 keeps margin: 0 so the eyebrow's margin-bottom owns the gap", () => {
  const body = ruleBody(css, ".dq-h1");
  // The headline must NOT introduce its own margin-top — that would
  // double-up with the eyebrow's margin-bottom (under collapsing
  // rules it would collapse to the max, not the sum, but it still
  // adds a maintenance trap). The convention is: eyebrow owns the
  // spacing, period.
  assert.match(
    body,
    /margin:\s*0/,
    `.dq-h1 must declare margin: 0 — found body: ${body}`
  );
  assert.doesNotMatch(
    body,
    /margin-top:/,
    `.dq-h1 must NOT declare margin-top (eyebrow owns the gap) — found body: ${body}`
  );
});

test(".dq-h2 keeps margin: 0 so the eyebrow's margin-bottom owns the gap", () => {
  const body = ruleBody(css, ".dq-h2");
  assert.match(
    body,
    /margin:\s*0/,
    `.dq-h2 must declare margin: 0 — found body: ${body}`
  );
  assert.doesNotMatch(
    body,
    /margin-top:/,
    `.dq-h2 must NOT declare margin-top (eyebrow owns the gap) — found body: ${body}`
  );
});

test("the .dq-eyebrow rule sits OUTSIDE @layer — required to beat Tailwind's layered mt-* utilities", () => {
  // The earlier PRs failed because Tailwind v4 puts `mt-*` utilities
  // inside `@layer utilities`. Unlayered CSS wins specificity against
  // any layer. If someone wraps `.dq-eyebrow` in an `@layer` block,
  // the eyebrow's margin-bottom would start losing to utility mt-*
  // on certain elements — re-introducing exactly the silent-no-op
  // bug this fix is meant to eliminate.
  //
  // Naive guard: find the line that opens the `.dq-eyebrow` rule and
  // walk backwards looking for an opening `@layer { ... }` that
  // contains it. We accept this fails to catch sufficiently weird
  // nesting; the goal is a sanity rail, not a CSS parser.
  const eyebrowIdx = css.search(/^\.dq-eyebrow\s*\{/m);
  assert.ok(eyebrowIdx >= 0, "couldn't locate .dq-eyebrow opening brace");
  // Slice everything before the rule. Count layer-open and
  // layer-close braces. If layer-open > layer-close, the rule is
  // inside a layer.
  const before = css.slice(0, eyebrowIdx);
  // Match `@layer <name> {` openings only (NOT bare `@layer a, b;`
  // declarations which don't open a block).
  const layerOpens = (before.match(/@layer[^{;]*\{/g) ?? []).length;
  const layerCloses = (before.match(/\}\s*\/\*\s*end @layer/gi) ?? []).length;
  // Without explicit "end @layer" markers we can't reliably count
  // closes. Fall back to: the rule must not be preceded by an
  // unclosed `@layer ... {`. We approximate by checking that within
  // the 200 chars immediately before .dq-eyebrow there's no
  // `@layer` opening that hasn't been closed.
  const nearby = css.slice(Math.max(0, eyebrowIdx - 400), eyebrowIdx);
  assert.doesNotMatch(
    nearby,
    /@layer\b[^{;}]*\{[^}]*$/,
    "the .dq-eyebrow rule appears to sit inside an @layer block — that would let Tailwind's layered mt-* utilities override it again"
  );
  // Surface the layer counts in the failure message even if they
  // don't drive the assertion (helpful debug context).
  void layerOpens;
  void layerCloses;
});
