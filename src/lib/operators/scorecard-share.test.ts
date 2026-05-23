// PR #75 — Source-level tests for the prospect-share polish.
// Behavioral tests for the React component + the next/og
// ImageResponse render path require a browser + a font server we
// don't wire up in CI. This file covers the source-level
// contracts that catch the most destructive regressions:
//
//   - CopyLinkButton's clipboard-API fallback path is wired up
//   - CopyLinkButton fires the scorecard_link_copied PostHog event
//   - The opengraph-image route exports the next/og conventions
//     (size, runtime, contentType, default function)
//   - The opengraph-image route Sentry-instruments its failure
//     mode so a broken share image surfaces in monitoring
//
// Same pattern as src/lib/auth/invitation-webhook.test.ts (PR #71)
// and src/lib/watch-list/route-flush.test.ts (PR #74).

import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COPY_LINK_SRC = readFileSync(
  join(process.cwd(), "src/components/scorecard/CopyLinkButton.tsx"),
  "utf8"
);

const OG_IMAGE_SRC = readFileSync(
  join(
    process.cwd(),
    "src/app/property-managers/[state]/[city]/[slug]/opengraph-image.tsx"
  ),
  "utf8"
);

// ─── CopyLinkButton ──────────────────────────────────────────────

test("CopyLinkButton is a client component", () => {
  // navigator.clipboard requires a client component. If anyone
  // refactors and accidentally removes "use client", the build
  // silently falls back to a server component that crashes at
  // runtime when the click handler tries to touch window.
  assert.ok(
    COPY_LINK_SRC.includes('"use client"'),
    "CopyLinkButton must declare 'use client' at the top of the file"
  );
});

test("CopyLinkButton fires the scorecard_link_copied PostHog event", () => {
  // The whole point of the analytics hook — if anyone removes the
  // capture() call, we lose the share-distribution signal that
  // ranks scorecards by interest.
  assert.ok(
    COPY_LINK_SRC.includes('capture("scorecard_link_copied"'),
    "CopyLinkButton must capture the scorecard_link_copied event"
  );
  assert.ok(
    COPY_LINK_SRC.includes("operator_slug"),
    "scorecard_link_copied event must include operator_slug property for funnel attribution"
  );
});

test("CopyLinkButton feature-detects navigator.clipboard before calling writeText", () => {
  // The fallback path only triggers when the API is unavailable.
  // If the feature detection is removed, mobile + old Safari users
  // get a runtime TypeError instead of the modal.
  assert.ok(
    /!navigator\.clipboard|navigator\.clipboard\s*===?\s*undefined|typeof navigator/.test(
      COPY_LINK_SRC
    ),
    "CopyLinkButton must feature-detect navigator.clipboard before calling it"
  );
  assert.ok(
    COPY_LINK_SRC.includes("setFallbackUrl"),
    "CopyLinkButton must surface a fallback URL when clipboard is unavailable"
  );
});

test("CopyLinkButton try/catches navigator.clipboard.writeText", () => {
  // writeText can reject at runtime (permission denied, locked
  // page) even when the API exists. The catch must fall through
  // to the same fallback-modal path.
  const writeTextRegion = COPY_LINK_SRC.match(
    /try\s*{[\s\S]*?navigator\.clipboard\.writeText[\s\S]*?}\s*catch/
  );
  assert.ok(
    writeTextRegion,
    "navigator.clipboard.writeText must be inside a try/catch"
  );
});

test("CopyLinkButton Sentry-instruments the fallback path", () => {
  // Belt-and-suspenders: if real users hit the fallback in
  // production, we want to know. captureMessage for the
  // unavailable-API branch; captureException for the rejected-
  // writeText branch.
  assert.ok(
    COPY_LINK_SRC.includes("Sentry.captureMessage") ||
      COPY_LINK_SRC.includes("Sentry.captureException"),
    "CopyLinkButton must Sentry-instrument at least one fallback path"
  );
});

test("CopyLinkButton renders a fallback modal (not just a console error)", () => {
  // The fallback must produce visible UI so the user can still
  // copy the URL. If anyone removes the FallbackModal component,
  // mobile Safari users get a silent no-op on click.
  assert.ok(
    COPY_LINK_SRC.includes("FallbackModal") &&
      COPY_LINK_SRC.includes("role=\"dialog\""),
    "CopyLinkButton must render a FallbackModal with role=dialog when the clipboard API is unavailable"
  );
});

// ─── opengraph-image route ───────────────────────────────────────

test("opengraph-image exports the next/og file-convention contract", () => {
  // Next.js's file-convention OG image routing requires specific
  // named exports. If any are missing, the route silently falls
  // back to the default Vercel card.
  assert.ok(
    OG_IMAGE_SRC.includes('from "next/og"') &&
      OG_IMAGE_SRC.includes("ImageResponse"),
    "must import ImageResponse from next/og"
  );
  assert.ok(
    /export\s+const\s+size\s*=\s*{\s*width:\s*1200,\s*height:\s*630\s*}/.test(
      OG_IMAGE_SRC
    ),
    "must export size = { width: 1200, height: 630 } per OG spec"
  );
  assert.ok(
    /export\s+const\s+contentType\s*=\s*"image\/png"/.test(OG_IMAGE_SRC),
    "must export contentType = 'image/png'"
  );
  assert.ok(
    /export\s+default\s+async\s+function/.test(OG_IMAGE_SRC),
    "must export a default async function for Next.js to invoke"
  );
});

test("opengraph-image uses the nodejs runtime (needs Prisma)", () => {
  // The route reads from Prisma to resolve the operator slug. Edge
  // runtime would be faster but doesn't expose the Prisma client.
  // If the runtime is changed to "edge", Prisma calls will throw.
  assert.ok(
    /export\s+const\s+runtime\s*=\s*"nodejs"/.test(OG_IMAGE_SRC),
    "must export runtime = 'nodejs' so Prisma is available"
  );
});

test("opengraph-image handles the quadrant-segment branch", () => {
  // The [slug] segment is overloaded (PM slug or quadrant
  // segment). Segment routes have no per-operator data — the
  // route must fall through to a branded card rather than throw.
  assert.ok(
    OG_IMAGE_SRC.includes("isQuadrantSegment"),
    "opengraph-image must check isQuadrantSegment before assuming the slug is a PM"
  );
});

test("opengraph-image Sentry-instruments its failure mode", () => {
  // A broken OG image is worse than a generic one for the share
  // experience — the prospect sees a "preview failed" error
  // instead of a Dwellsy IQ card. The route must catch any
  // unexpected error and surface it to Sentry while falling
  // through to the branded fallback.
  assert.ok(
    OG_IMAGE_SRC.includes("Sentry.captureException"),
    "opengraph-image must Sentry.captureException on render errors"
  );
  const tryCatchRegion = OG_IMAGE_SRC.match(/try\s*{[\s\S]*?}\s*catch/);
  assert.ok(
    tryCatchRegion,
    "opengraph-image must wrap the dynamic render path in try/catch"
  );
});

test("opengraph-image reads star counts via the shared stars helper", () => {
  // The cohort framing line + OG image must agree on which axes
  // contributed gold/silver. If anyone reimplements the count
  // locally, the OG image and the page can drift.
  assert.ok(
    OG_IMAGE_SRC.includes("countOperatorStars"),
    "opengraph-image must use countOperatorStars from the shared module"
  );
  assert.ok(
    OG_IMAGE_SRC.includes("starableAxisCount"),
    "opengraph-image must use starableAxisCount so the 'of N' denominator matches the page"
  );
});

// ─── Wiring guards ──────────────────────────────────────────────

test("scorecard_link_copied is registered in the EventName union", () => {
  // PostHog's TS types gate the capture() call — if the event
  // isn't in the union, the build breaks before deploy. Asserting
  // it explicitly here catches the case where someone removes it
  // from the union but forgets to remove the capture call.
  const analyticsSrc = readFileSync(
    join(process.cwd(), "src/lib/analytics.ts"),
    "utf8"
  );
  assert.ok(
    analyticsSrc.includes('"scorecard_link_copied"'),
    "scorecard_link_copied must be a member of the EventName union in analytics.ts"
  );
});

test("CopyLinkButton is wired into IdentityHero's right rail", () => {
  // The component does nothing if it's not rendered. Verify the
  // import + the JSX usage are both present in IdentityHero.
  const heroSrc = readFileSync(
    join(process.cwd(), "src/components/scorecard/IdentityHero.tsx"),
    "utf8"
  );
  assert.ok(
    heroSrc.includes('import { CopyLinkButton }'),
    "IdentityHero must import CopyLinkButton"
  );
  assert.ok(
    heroSrc.includes("<CopyLinkButton"),
    "IdentityHero must render <CopyLinkButton ... />"
  );
  assert.ok(
    heroSrc.includes("operatorSlug={scorecard.pm.slug}"),
    "IdentityHero must pass operatorSlug={scorecard.pm.slug} to CopyLinkButton"
  );
});

test("SynthesisLayer renders the cohort framing line above the Executive summary", () => {
  // Order check: the cohort framing must precede the Executive
  // summary in the source so the rendered DOM matches the spec
  // ("TL;DR first, then narrative"). Anchored on JSX-only markers
  // (data-testid + the {executiveSummary && (...)} guard) so
  // comments mentioning "Executive summary" don't fool the
  // ordering check.
  const synthesisSrc = readFileSync(
    join(process.cwd(), "src/components/scorecard/SynthesisLayer.tsx"),
    "utf8"
  );
  assert.ok(
    synthesisSrc.includes("buildCohortFramingSentence"),
    "SynthesisLayer must import + call buildCohortFramingSentence"
  );
  const framingIdx = synthesisSrc.indexOf('data-testid="cohort-framing"');
  const executiveJsxIdx = synthesisSrc.indexOf("{executiveSummary && (");
  assert.ok(framingIdx > 0, "cohort framing line must be rendered");
  assert.ok(
    executiveJsxIdx > 0,
    "Executive summary conditional render must still be present"
  );
  assert.ok(
    framingIdx < executiveJsxIdx,
    "cohort framing JSX must come BEFORE the Executive summary JSX in source order"
  );
});
