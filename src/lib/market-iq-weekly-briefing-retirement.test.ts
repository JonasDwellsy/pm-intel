import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("retired Market IQ weekly briefing", () => {
  it("is absent from customer navigation and the Market IQ home page", async () => {
    const [navigation, sectionNavigation, home] = await Promise.all([
      readFile("src/lib/market-iq/navigation.ts", "utf8"),
      readFile("src/components/market-iq/MarketIqSectionNavigation.tsx", "utf8"),
      readFile("src/app/market-iq/page.tsx", "utf8"),
    ]);

    assert.doesNotMatch(navigation, /briefing:\s*["']\/market-iq\/briefing/);
    assert.doesNotMatch(`${sectionNavigation}\n${home}`, /Weekly briefing|\/market-iq\/briefing/i);
  });

  it("redirects legacy customer URLs to Daily Edition", async () => {
    const [briefingPage, archivePage] = await Promise.all([
      readFile("src/app/market-iq/briefing/page.tsx", "utf8"),
      readFile("src/app/market-iq/briefing/[snapshotId]/page.tsx", "utf8"),
    ]);

    assert.match(briefingPage, /permanentRedirect\("\/market-iq\/daily"\)/);
    assert.match(archivePage, /permanentRedirect\("\/market-iq\/daily"\)/);
  });

  it("does not schedule the retired briefing workflow", async () => {
    const vercel = await readFile("vercel.json", "utf8");
    assert.doesNotMatch(vercel, /market-iq-internal-briefing/);
  });
});
