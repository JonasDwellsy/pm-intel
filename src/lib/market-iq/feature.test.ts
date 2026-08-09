import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  marketIqPreviewEnabled,
  marketIqPublicReviewEnabled,
} from "./feature";

test("Market IQ is disabled by default", () => {
  assert.equal(marketIqPreviewEnabled(undefined), false);
  assert.equal(marketIqPreviewEnabled(""), false);
  assert.equal(marketIqPreviewEnabled("true"), false);
});

test("Market IQ requires the explicit preview value", () => {
  assert.equal(marketIqPreviewEnabled("1"), true);
});

test("public review requires both the branch flag and Vercel Preview", () => {
  assert.equal(marketIqPublicReviewEnabled("1", "preview"), true);
  assert.equal(marketIqPublicReviewEnabled("1", "production"), false);
  assert.equal(marketIqPublicReviewEnabled(undefined, "preview"), false);
});

test("the Market IQ route checks the disabled-by-default flag before auth or database access", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/market-iq/page.tsx"),
    "utf8"
  );
  const flagCheck = source.indexOf("if (!marketIqPreviewEnabled()) notFound()");
  const productCheck = source.indexOf("await viewerHasProductAccess");
  const marketCheck = source.indexOf("await resolveViewerEntitlement");

  assert.ok(flagCheck >= 0);
  assert.ok(productCheck > flagCheck);
  assert.ok(marketCheck > productCheck);
});

test("the integration preview root redirects before Operator IQ database reads", () => {
  const source = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  const redirectCheck = source.indexOf(
    'if (marketIqPreviewEnabled()) redirect("/market-iq")'
  );
  const operatorIqRead = source.indexOf("await prisma.market.findMany", redirectCheck);

  assert.ok(redirectCheck >= 0);
  assert.ok(operatorIqRead > redirectCheck);
});
