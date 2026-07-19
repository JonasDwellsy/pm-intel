// Component test for ScorecardBody's right-rail nav construction — final-
// review Fix 2: the "Properties" nav entry (and the Methodology entry's
// section number) must be gated on `scorecard.propertyDetail` actually
// having properties, so a scorecard without property-level data doesn't
// show a dangling "05 Properties" link or a "01,02,03,04,06" number skip.
//
// Every section component except ScorecardNav is mocked out — ScorecardBody
// itself only needs to be exercised for its own composition logic (the
// navSections array), not for what each section renders. This keeps the
// fixture minimal: only the object paths ScorecardBody's own code touches
// directly (view.watchItems, view.operating, view.momentum, view.header,
// scorecard.pm, scorecard.market) need to be present; props consumed only
// by (mocked) children never get evaluated deeper than that.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ScorecardData } from "@/lib/types";
import type { ScorecardView } from "@/lib/scorecard/view-model";

vi.mock("@/components/scorecard/redesign/ScorecardHeader", () => ({
  ScorecardHeader: () => null,
}));
vi.mock("@/components/scorecard/redesign/ExecReadout", () => ({
  ExecReadout: () => null,
}));
vi.mock("@/components/scorecard/redesign/ScaleFitSection", () => ({
  ScaleFitSection: () => null,
}));
vi.mock("@/components/scorecard/redesign/OperatingPerformanceSection", () => ({
  OperatingPerformanceSection: () => null,
}));
vi.mock("@/components/scorecard/redesign/MomentumSection", () => ({
  MomentumSection: () => null,
}));
vi.mock("@/components/scorecard/redesign/WatchItemsSection", () => ({
  WatchItemsSection: () => null,
}));
vi.mock("@/components/scorecard/redesign/PropertyDetailSection", () => ({
  PropertyDetailSection: () => null,
}));
vi.mock("@/components/scorecard/MethodologyFooter", () => ({
  MethodologyFooter: () => null,
}));

import { ScorecardBody } from "./ScorecardBody";

function makeView(): ScorecardView {
  return {
    watchItems: [],
    operating: {},
    momentum: {},
    header: {},
  } as unknown as ScorecardView;
}

function makeScorecard(propertyDetail?: ScorecardData["propertyDetail"]): ScorecardData {
  return {
    propertyDetail,
    pm: { slug: "test-operator" },
    market: { state: "CA", name: "Test City" },
  } as unknown as ScorecardData;
}

function getNavLink(name: string): HTMLElement {
  return screen.getByRole("link", { name: new RegExp(name) });
}

describe("ScorecardBody nav section gating (Fix 2)", () => {
  it("omits the Properties nav entry and numbers Methodology 05 when propertyDetail is absent", () => {
    render(
      <ScorecardBody
        view={makeView()}
        scorecard={makeScorecard(undefined)}
        isClaimed={false}
        geographicCoverage={undefined as unknown as ScorecardData["geographicCoverage"]}
      />
    );

    expect(screen.queryByRole("link", { name: /Properties/ })).toBeNull();

    const methodologyLink = getNavLink("Methodology");
    expect(methodologyLink.textContent).toMatch(/05/);
    expect(methodologyLink.textContent).not.toMatch(/06/);
  });

  it("omits the Properties nav entry when propertyDetail has zero properties", () => {
    render(
      <ScorecardBody
        view={makeView()}
        scorecard={makeScorecard({ properties: [], comps: {} } as unknown as ScorecardData["propertyDetail"])}
        isClaimed={false}
        geographicCoverage={undefined as unknown as ScorecardData["geographicCoverage"]}
      />
    );

    expect(screen.queryByRole("link", { name: /Properties/ })).toBeNull();
    expect(getNavLink("Methodology").textContent).toMatch(/05/);
  });

  it("includes the Properties nav entry (05) and numbers Methodology 06 when propertyDetail has properties", () => {
    const propertyDetail = {
      properties: [
        {
          kind: "community",
          label: "The Oaks",
          submarket: null,
          units: 140,
          homes: null,
          nListings: 18,
          medianDomT12: 22,
          medianRentT12: 1450,
          rentYoY: 0.04,
          concessionRate: 0.1,
          listingQuality: 78,
        },
      ],
      comps: { medianDomT12: 29, medianRentT12: 1510, rentYoY: 0.021, concessionRate: 0.18 },
    } as unknown as ScorecardData["propertyDetail"];

    render(
      <ScorecardBody
        view={makeView()}
        scorecard={makeScorecard(propertyDetail)}
        isClaimed={false}
        geographicCoverage={undefined as unknown as ScorecardData["geographicCoverage"]}
      />
    );

    const propertiesLink = getNavLink("Properties");
    expect(propertiesLink.textContent).toMatch(/05/);

    const methodologyLink = getNavLink("Methodology");
    expect(methodologyLink.textContent).toMatch(/06/);
  });

  it("omits the Properties nav entry and numbers Methodology 05 on the public sample even when propertyDetail has properties", () => {
    const propertyDetail = {
      properties: [
        {
          kind: "community",
          label: "The Oaks",
          submarket: null,
          units: 140,
          homes: null,
          nListings: 18,
          medianDomT12: 22,
          medianRentT12: 1450,
          rentYoY: 0.04,
          concessionRate: 0.1,
          listingQuality: 78,
        },
      ],
      comps: { medianDomT12: 29, medianRentT12: 1510, rentYoY: 0.021, concessionRate: 0.18 },
    } as unknown as ScorecardData["propertyDetail"];

    render(
      <ScorecardBody
        view={makeView()}
        scorecard={makeScorecard(propertyDetail)}
        isClaimed={false}
        geographicCoverage={undefined as unknown as ScorecardData["geographicCoverage"]}
        publicSample
      />
    );

    // Property-level detail is gated + premium → suppressed on /sample, so the
    // nav entry drops and Methodology falls back to 05 (no dangling link / no
    // number skip), exactly as when propertyDetail is absent.
    expect(screen.queryByRole("link", { name: /Properties/ })).toBeNull();
    expect(getNavLink("Methodology").textContent).toMatch(/05/);
  });
});
