import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "vitest";

const DAILY_SECTION_DIRECTORIES = [
  "src/lib/market-iq",
  "src/components/market-iq/report",
];

function dailySectionModules() {
  return DAILY_SECTION_DIRECTORIES.flatMap((directory) => readdirSync(directory)
    .filter((file) => /daily/i.test(file) && /\.tsx?$/.test(file) && !/\.test\./.test(file))
    .map((file) => join(directory, file)));
}

describe("daily event module boundary", () => {
  it("does not import monthly trend modules or types", () => {
    const modules = dailySectionModules();
    assert.ok(modules.length >= 2, "Expected the daily headline and presentation modules to be guarded.");
    for (const file of modules) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.doesNotMatch(source, /from\s+["'][^"']*(?:alerts|trends)[^"']*["']/, file);
      assert.doesNotMatch(source, /from\s+["'][^"']*report\/report["']/, file);
      assert.doesNotMatch(source, /MarketIqTrend(?:Point|Series)?/, file);
    }
  });

  it("keeps the saved-record explorer free of live source and database access", () => {
    const files = [
      "src/lib/market-iq/daily-event-explorer.ts",
      "src/lib/market-iq/daily-event-export.ts",
      "src/components/market-iq/report/MarketIqDailyEventExplorer.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.doesNotMatch(source, /from\s+["'][^"']*\.server["']/, file);
      assert.doesNotMatch(source, /dwellsy-source|\bprisma\b|\bfetch\s*\(/, file);
    }
  });
});
