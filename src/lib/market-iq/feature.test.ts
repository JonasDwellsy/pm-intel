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

test("the integration preview root opens the latest public Market IQ report before Operator IQ reads", () => {
  const source = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  const previewCheck = source.indexOf("if (marketIqPreviewEnabled())");
  const reportRead = source.indexOf("prisma.marketIqReport.findFirst", previewCheck);
  const publicRedirect = source.indexOf("/reports/market/", reportRead);
  const seededFallback = source.indexOf("SEEDED_CLEVELAND_REPORT_TOKEN", publicRedirect);
  const operatorIqRead = source.indexOf("await prisma.market.findMany", publicRedirect);

  assert.ok(previewCheck >= 0);
  assert.ok(reportRead > previewCheck);
  assert.ok(publicRedirect > reportRead);
  assert.ok(seededFallback > publicRedirect);
  assert.ok(operatorIqRead > publicRedirect);
});

test("the standalone sign-in returns to Market IQ on the same origin", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/sign-in/[[...sign-in]]/page.tsx"),
    "utf8"
  );

  assert.match(source, /marketIqPreviewEnabled\(\)/);
  assert.match(source, /forceRedirectUrl: "\/market-iq"/);
  assert.match(source, /marketIqPreview \? "Market IQ" : "Operator IQ"/);
});

test("the standalone preview keeps unauthenticated Market IQ navigation on its own origin", () => {
  const source = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

  assert.match(source, /isMarketIqPageRoute/);
  assert.match(source, /MARKET_IQ_PREVIEW_ENABLED === "1"/);
  assert.match(source, /new URL\("\/sign-in", req\.url\)/);
  assert.match(source, /auth\.protect\(\{ unauthenticatedUrl: signInUrl\.toString\(\) \}\)/);

  const scopedOverride = source.indexOf("isMarketIqPageRoute(req)");
  const defaultProtection = source.lastIndexOf("await auth.protect()");
  assert.ok(scopedOverride >= 0);
  assert.ok(defaultProtection > scopedOverride);
});
