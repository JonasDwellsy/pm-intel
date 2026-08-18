import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Market IQ setup does not wait for the live Trends source", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/market-iq/get-started/page.tsx"),
    "utf8",
  );

  assert.match(source, /buildMarketIqSetupFallbackSnapshot/);
  assert.match(source, /source: "scope_catalog"/);
  assert.doesNotMatch(source, /buildMarketIqComposerPreview/);
});

test("logo upload is available to entitled Market IQ organizations in every market", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/market-iq/brand/logo/route.ts"),
    "utf8",
  );

  assert.match(source, /access\.hasProduct/);
  assert.doesNotMatch(source, /CLEVELAND_MARKET_ID/);
  assert.doesNotMatch(source, /isMarketEntitled/);
});
