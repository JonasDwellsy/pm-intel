import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the data operations panel is admin-only and reads persisted evidence", () => {
  const page = readFileSync("src/app/market-iq/internal/data-operations/page.tsx", "utf8");
  const loader = readFileSync("src/lib/market-iq/data-operations.server.ts", "utf8");
  assert.match(page, /isAdminUser\(userId\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /25-market daily supply history/);
  assert.match(loader, /marketIqNationalSupplySnapshot\.findMany/);
  assert.match(loader, /marketIqListingFeedRun\.findMany/);
  assert.match(loader, /marketIqReportSourceSnapshot\.findMany/);
  assert.doesNotMatch(loader, /dwellsy-source|active_listing_table|new Pool/);
  assert.doesNotMatch(loader, /create\(|update\(|upsert\(|delete\(/);
});

test("the admin panel exposes completeness, missing dates, launched feeds, and failures", () => {
  const page = readFileSync("src/app/market-iq/internal/data-operations/page.tsx", "utf8");
  assert.match(page, /Seven-day coverage/);
  assert.match(page, /Missing dates/);
  assert.match(page, /Detailed listing feeds/);
  assert.match(page, /Recent detailed captures/);
  assert.match(page, /run\.error/);
});
