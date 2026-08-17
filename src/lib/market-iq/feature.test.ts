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
  const accessCheck = source.indexOf("await resolveViewerMarketIqAccess");
  const marketCheck = source.indexOf("isMarketEntitled(access.entitlement");

  assert.ok(flagCheck >= 0);
  assert.ok(accessCheck > flagCheck);
  assert.ok(marketCheck > accessCheck);
});

test("the integration preview root opens the public Market IQ front door before Operator IQ reads", () => {
  const source = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  const previewCheck = source.indexOf("if (marketIqPreviewEnabled())");
  const publicRedirect = source.indexOf('redirect("/market-iq/welcome")', previewCheck);
  const operatorIqRead = source.indexOf("await prisma.market.findMany", publicRedirect);

  assert.ok(previewCheck >= 0);
  assert.ok(publicRedirect > previewCheck);
  assert.ok(operatorIqRead > publicRedirect);
});

test("the standalone sign-in returns to Market IQ on the same origin", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/sign-in/[[...sign-in]]/page.tsx"),
    "utf8"
  );

  assert.match(source, /marketIqPreviewEnabled\(\)/);
  assert.match(source, /forceRedirectUrl: marketIqRedirectUrl/);
  assert.match(source, /redirectUrl\?\.startsWith\("\/market-iq"\)/);
  assert.match(source, /marketIqPreview \? "Market IQ" : "Operator IQ"/);
});

test("Market IQ owns a standalone application shell", () => {
  const conditionalChrome = readFileSync(
    join(process.cwd(), "src/components/layout/ConditionalChrome.tsx"),
    "utf8"
  );
  const layout = readFileSync(
    join(process.cwd(), "src/app/market-iq/layout.tsx"),
    "utf8"
  );
  const header = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqAppHeader.tsx"),
    "utf8"
  );
  const footer = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqAppFooter.tsx"),
    "utf8"
  );

  assert.match(conditionalChrome, /"\/market-iq"/);
  assert.match(layout, /<MarketIqAppHeader \/>/);
  assert.match(layout, /<MarketIqAppFooter \/>/);
  assert.match(header, />Market IQ</);
  assert.doesNotMatch(header, /Dwellsy IQ Online|Operator IQ/);
  assert.doesNotMatch(footer, /Dwellsy IQ Online|Operator IQ/);
});

test("Market IQ home and detailed market read are distinct routes", () => {
  const home = readFileSync(join(process.cwd(), "src/app/market-iq/page.tsx"), "utf8");
  const market = readFileSync(
    join(process.cwd(), "src/app/market-iq/market/page.tsx"),
    "utf8"
  );

  assert.match(home, /Know what changed before the next owner conversation/);
  assert.match(home, /href="\/market-iq\/market"/);
  assert.match(market, /<ClevelandPilot/);
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

test("the public Cleveland read tolerates a fresh preview database without historical imports", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/market-iq/report/build.server.ts"),
    "utf8"
  );
  const analyticalContext = source.indexOf("const analyticalContext");
  const historicalLoad = source.indexOf("loadClevelandHistoricalPulse()", analyticalContext);
  const fallback = source.indexOf(".catch(() => null)", historicalLoad);
  const reportBuild = source.indexOf("return buildMarketIqReportSnapshot", fallback);

  assert.ok(analyticalContext >= 0);
  assert.ok(historicalLoad > analyticalContext);
  assert.ok(fallback > historicalLoad);
  assert.ok(reportBuild > fallback);
});
