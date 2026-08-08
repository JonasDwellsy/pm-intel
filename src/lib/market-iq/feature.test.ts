import test from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marketIqPreviewEnabled } from "./feature";

test("Market IQ is disabled by default", () => {
  assert.equal(marketIqPreviewEnabled(undefined), false);
  assert.equal(marketIqPreviewEnabled(""), false);
  assert.equal(marketIqPreviewEnabled("true"), false);
});

test("Market IQ requires the explicit preview value", () => {
  assert.equal(marketIqPreviewEnabled("1"), true);
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
