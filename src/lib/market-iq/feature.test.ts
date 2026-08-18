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

test("the Market IQ shell follows the purchased plan boundary", () => {
  const header = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqAppHeader.tsx"),
    "utf8"
  );
  const navigation = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqAppNavigation.tsx"),
    "utf8"
  );
  const activation = readFileSync(
    join(process.cwd(), "src/components/market-iq/activation/MarketIqActivationFlow.tsx"),
    "utf8"
  );

  assert.match(header, /resolveViewerMarketIqAccess/);
  assert.match(header, /clientAdvisoryEnabled=\{Boolean\(access\?\.capabilities\.publishClientReports\)\}/);
  assert.match(navigation, /clientAdvisoryEnabled \? ADVISORY_ITEMS : \[\]/);
  assert.match(navigation, /hasProduct && <Link href="\/market-iq\/get-started"/);
  assert.match(activation, /clientAdvisoryEnabled \? \[\{ step: 1, label: "Your firm" \}/);
  assert.match(activation, /"Activate and open market"/);
});

test("successful checkout hands off automatically to plan-aware activation", () => {
  const subscribe = readFileSync(
    join(process.cwd(), "src/app/market-iq/subscribe/page.tsx"),
    "utf8"
  );
  const statusRoute = readFileSync(
    join(process.cwd(), "src/app/api/market-iq/billing/status/route.ts"),
    "utf8"
  );
  const finalization = readFileSync(
    join(process.cwd(), "src/components/market-iq/billing/MarketIqCheckoutFinalization.tsx"),
    "utf8"
  );

  assert.match(subscribe, /query\.checkout === "success" && <MarketIqCheckoutFinalization/);
  assert.match(statusRoute, /isMarketEntitled\(access\.entitlement, CLEVELAND_MARKET_ID\)/);
  assert.match(statusRoute, /publishClientReports/);
  assert.match(statusRoute, /"Cache-Control": "no-store"/);
  assert.match(finalization, /MAX_ATTEMPTS = 30/);
  assert.match(finalization, /\/api\/market-iq\/billing\/status/);
  assert.match(finalization, /Continue to setup/);
});

test("Market IQ provides a self-service account and billing center", () => {
  const account = readFileSync(
    join(process.cwd(), "src/app/market-iq/account/page.tsx"),
    "utf8"
  );
  const header = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqAppHeader.tsx"),
    "utf8"
  );

  assert.match(account, /Market IQ settings/);
  assert.match(account, /Manage billing in Stripe/);
  assert.match(account, /cancelAtPeriodEnd/);
  assert.match(account, /past_due/);
  assert.match(account, /Client Advisory is enabled/);
  assert.match(header, /href="\/market-iq\/account"/);
});

test("Market IQ home and detailed market read are distinct routes", () => {
  const home = readFileSync(join(process.cwd(), "src/app/market-iq/page.tsx"), "utf8");
  const market = readFileSync(
    join(process.cwd(), "src/app/market-iq/market/page.tsx"),
    "utf8"
  );

  assert.match(home, /Know what changed before the next owner conversation/);
  assert.match(home, /href="\/market-iq\/market"/);
  assert.match(market, /<MarketIqIntelligenceWorkspace/);
  assert.match(market, /loadCachedClevelandMarketIqReportSnapshot/);
});

test("the standalone navigation does not leak Operator IQ destinations", () => {
  const navigation = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqAppNavigation.tsx"),
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

  assert.match(navigation, /label: "Market intelligence"/);
  assert.match(navigation, /label: "Recipients"/);
  assert.doesNotMatch(navigation, /label: "Local areas"/);
  assert.doesNotMatch(header, /OrganizationSwitcher/);
  assert.match(footer, /href="\/market-iq\/account"/);
  assert.doesNotMatch(footer, /href="\/privacy"|href="\/terms"/);
});

test("the standalone Market read tolerates an empty historical-import database", () => {
  const market = readFileSync(
    join(process.cwd(), "src/app/market-iq/market/page.tsx"),
    "utf8"
  );
  const trends = readFileSync(
    join(process.cwd(), "src/lib/market-iq/trends.server.ts"),
    "utf8"
  );

  assert.match(market, /loadCachedClevelandMarketIqReportSnapshot/);
  assert.match(market, /loadClevelandLiveListingPulse/);
  assert.match(trends, /if \(importedPulses\.length \|\| !marketIqPreviewEnabled\(\)\) return importedPulses/);
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

test("the isolated preview may use the configured read-only Dwellsy source without enabling production", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/market-iq/report/build.server.ts"),
    "utf8"
  );

  assert.match(source, /dwellsySourceConfigured\(\)/);
  assert.match(source, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(source, /process\.env\.DWELLSY_LIVE_RUNTIME_ENABLED === "1"/);
  assert.doesNotMatch(source, /process\.env\.VERCEL_ENV === "production"/);
});

test("Market IQ reuses the market snapshot without caching organization branding", () => {
  const build = readFileSync(
    join(process.cwd(), "src/lib/market-iq/report/build.server.ts"),
    "utf8"
  );
  const composer = readFileSync(
    join(process.cwd(), "src/lib/market-iq/report/composer.server.ts"),
    "utf8"
  );

  assert.match(build, /loadCachedClevelandMarketIqReportSnapshot = unstable_cache/);
  assert.match(build, /market-iq-cleveland-live-snapshot-v9/);
  assert.match(build, /Read-only Trends source unavailable/);
  assert.match(build, /revalidate: 900/);
  assert.match(composer, /const snapshot = await loadCachedClevelandMarketIqReportSnapshot\(\)/);
  assert.match(composer, /snapshot: \{ \.\.\.snapshot, brand \}/);
});

test("the Market Read opens a guided client-edition workflow that freezes selected findings", () => {
  const marketWorkspace = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqIntelligenceWorkspace.tsx"),
    "utf8"
  );
  const composer = readFileSync(
    join(process.cwd(), "src/components/market-iq/report/MarketIqReportComposerClient.tsx"),
    "utf8"
  );
  const action = readFileSync(
    join(process.cwd(), "src/app/market-iq/report/actions.ts"),
    "utf8"
  );

  assert.match(marketWorkspace, /\/market-iq\/report\?from=market-read&market=/);
  assert.doesNotMatch(composer, /Choose the evidence/);
  assert.match(composer, /Using the scope you confirmed during setup/);
  assert.match(composer, /Add your perspective/);
  assert.doesNotMatch(composer, /Confirm your firm/);
  assert.match(composer, /Your saved logo, colors, contact details, and company profile will be applied/);
  assert.match(composer, /name="displayName"/);
  assert.match(composer, /Review and publish/);
  assert.match(composer, /excluded values/);
  assert.match(composer, /name="findingIds"/);
  assert.match(composer, /id="client-preview"/);
  assert.match(action, /findingSelectionApplied/);
  assert.match(action, /findings: comparison\.findings\.filter/);
  assert.match(composer, /It never sends email/);
});

test("publishing hands the PM to an immutable edition receipt before distribution", () => {
  const action = readFileSync(
    join(process.cwd(), "src/app/market-iq/report/actions.ts"),
    "utf8"
  );
  const receipt = readFileSync(
    join(process.cwd(), "src/app/market-iq/published/[campaignId]/page.tsx"),
    "utf8"
  );

  assert.match(action, /redirect\(`\/market-iq\/published\/\$\{report\.campaignId\}`\)/);
  assert.match(receipt, /Client edition published/);
  assert.match(receipt, /Permanent client link/);
  assert.match(receipt, /What was frozen at publication/);
  assert.match(receipt, /Review audience and email/);
  assert.match(receipt, /Each initial send and retry still requires an explicit confirmation/);
  assert.match(receipt, /revokeMarketIqReport/);
});

test("Client Advisory navigation uses customer language and provides a report library", () => {
  const navigation = readFileSync(
    join(process.cwd(), "src/components/market-iq/MarketIqAppNavigation.tsx"),
    "utf8"
  );
  const reports = readFileSync(
    join(process.cwd(), "src/app/market-iq/editions/page.tsx"),
    "utf8"
  );

  assert.match(navigation, /label: "Client reports"/);
  assert.match(navigation, /label: "Recipients"/);
  assert.doesNotMatch(navigation, /label: "Editions"/);
  assert.match(reports, /Report library/);
  assert.match(reports, /Published links and delivery progress/);
  assert.match(reports, /Create client report/);
  assert.match(reports, /Open report receipt/);
  assert.match(reports, /No public link or email exists yet/);
});

test("resolved campaigns end in a customer-facing delivery receipt", () => {
  const actions = readFileSync(
    join(process.cwd(), "src/app/market-iq/distribution/actions.ts"),
    "utf8"
  );
  const receipt = readFileSync(
    join(process.cwd(), "src/app/market-iq/delivery/[campaignId]/page.tsx"),
    "utf8"
  );

  assert.match(actions, /nextCampaignStatus/);
  assert.match(actions, /redirect\(`\/market-iq\/delivery\/\$\{row\.campaign\.id\}/);
  assert.match(receipt, /Delivery receipt/);
  assert.match(receipt, /Provider accepted/);
  assert.match(receipt, /One status for each approved recipient/);
  assert.match(receipt, /It does not infer that an unopened email was read/);
  assert.match(receipt, /Retry recipient/);
  assert.match(receipt, /Continue confirmations/);
});
