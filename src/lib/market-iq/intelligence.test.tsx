import { describe, expect, it } from "vitest";
import { buildMarketIqDecisionFindings, buildMarketIqPostures } from "./intelligence";
import { seededClevelandMarketReport } from "./report/seeded-cleveland";

describe("Market IQ decision brief", () => {
  it("ranks broad market signals without promoting an isolated ZIP extreme", () => {
    const findings = buildMarketIqDecisionFindings(seededClevelandMarketReport, "Cleveland");
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.map((finding) => finding.rank)).toEqual(findings.map((_, index) => index + 1));
    expect(findings.some((finding) => finding.id === "listing-pressure")).toBe(true);
    expect(findings.map((finding) => finding.headline).join(" ")).not.toMatch(/ZIP \d{5}|127\.7%/);
  });

  it("creates consistent MSA posture rows with recent direction", () => {
    const postures = buildMarketIqPostures(seededClevelandMarketReport.marketRead.cells);
    expect(postures.length).toBeGreaterThan(1);
    expect(postures.every((posture) => posture.rent > 0)).toBe(true);
    expect(postures.some((posture) => posture.recentPct !== null)).toBe(true);
  });
});
