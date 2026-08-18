import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Market IQ home shows signed-in briefing readiness without sending", async () => {
  const home = await readFile("src/app/market-iq/page.tsx", "utf8");
  assert.match(home, /marketIqBriefingSnapshots/);
  assert.match(home, /marketIqBriefingEmailPreferences/);
  assert.match(home, /marketIqBriefingEmailDeliveries/);
  assert.match(home, /Your internal briefing/);
  assert.match(home, /New briefing ready/);
  assert.match(home, /Email updates off/);
  assert.match(home, /Current briefing emailed/);
  assert.doesNotMatch(home, /sendEmail|deliverMarketIqBriefingEmail|sendLatestMarketIqBriefingToMe/);
});

test("home briefing status stays separate from Client Advisory distribution", async () => {
  const home = await readFile("src/app/market-iq/page.tsx", "utf8");
  const briefingSection = home.slice(home.indexOf("Your internal briefing"), home.indexOf("Market portfolio"));
  assert.doesNotMatch(briefingSection, /marketIqReportRecipient|marketIqDistributionCampaign|SendGrid/);
});
