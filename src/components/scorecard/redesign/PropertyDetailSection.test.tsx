// Component test for the Properties section (Task 4 — property-level
// detail; Task 5 wires in PropertyExportButton, which reads
// `scorecard.pm.slug`). PropertyDetailSection only reads
// `scorecard.propertyDetail` and `scorecard.pm.slug`, so the fixture below is
// a minimal cast rather than a full ScorecardData — same shortcut
// src/lib/scorecard/pdf-coverage-map.test.ts takes for a narrow-surface
// component.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertyDetailSection } from "./PropertyDetailSection";
import type { ScorecardData, PropertyDetailBlock } from "@/lib/types";

const PROPERTY_DETAIL: PropertyDetailBlock = {
  properties: [
    {
      kind: "community",
      label: "The Oaks",
      submarket: null,
      units: 120,
      homes: null,
      nListings: 18,
      medianDomT12: 22,
      medianRentT12: 1450,
      rentYoY: 0.04,
      concessionRate: 0.1,
      listingQuality: 78,
    },
    {
      kind: "sfr-submarket",
      label: "North Suburbs",
      submarket: "North Suburbs",
      units: null,
      homes: 34,
      nListings: 41,
      medianDomT12: 35,
      medianRentT12: 1900,
      rentYoY: -0.01,
      concessionRate: 0.25,
      listingQuality: 55,
    },
  ],
  comps: {
    medianDomT12: 29,
    medianRentT12: 1510,
    rentYoY: 0.021,
    concessionRate: 0.18,
  },
};

function makeScorecard(propertyDetail?: PropertyDetailBlock): ScorecardData {
  return {
    propertyDetail,
    pm: { slug: "test-operator" },
  } as unknown as ScorecardData;
}

describe("PropertyDetailSection", () => {
  it("renders nothing when propertyDetail is absent", () => {
    const { container } = render(
      <PropertyDetailSection scorecard={makeScorecard(undefined)} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when propertyDetail has no properties", () => {
    const { container } = render(
      <PropertyDetailSection
        scorecard={makeScorecard({ ...PROPERTY_DETAIL, properties: [] })}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a row per property with both value and MSA comp shown", () => {
    render(<PropertyDetailSection scorecard={makeScorecard(PROPERTY_DETAIL)} />);

    // Community row: DOM value (22) and comp (mkt 29) both present.
    expect(screen.getByText("22")).toBeTruthy();
    expect(screen.getAllByText(/mkt 29/).length).toBeGreaterThan(0);

    // SFR row: DOM value (35) and the same comp (mkt 29) both present.
    expect(screen.getByText("35")).toBeTruthy();
  });

  it("a community row shows units; an SFR row shows homes + 'SFR · {submarket}'", () => {
    render(<PropertyDetailSection scorecard={makeScorecard(PROPERTY_DETAIL)} />);

    expect(screen.getByText("The Oaks")).toBeTruthy();
    expect(screen.getByText("120 units")).toBeTruthy();

    expect(screen.getByText("SFR · North Suburbs")).toBeTruthy();
    expect(screen.getByText("34 homes")).toBeTruthy();
  });

  it("clicking the Median DOM header sorts rows by DOM (ascending first click)", async () => {
    const user = userEvent.setup();
    render(<PropertyDetailSection scorecard={makeScorecard(PROPERTY_DETAIL)} />);

    // Default sort is N Listings desc, so North Suburbs (41) leads The Oaks (18).
    const rowsBefore = screen.getAllByRole("row").slice(1); // drop header row
    expect(rowsBefore[0].textContent).toMatch(/North Suburbs/);

    // Anchored to start so it matches the sort button ("Median DOM") and not
    // the column's info tip ("About Median DOM").
    await user.click(screen.getByRole("button", { name: /^Median DOM/ }));

    const rowsAfter = screen.getAllByRole("row").slice(1);
    // Ascending DOM: The Oaks (22) before North Suburbs (35).
    expect(rowsAfter[0].textContent).toMatch(/The Oaks/);
    expect(rowsAfter[1].textContent).toMatch(/North Suburbs/);
  });

  it("never renders a score/star/percentile affordance", () => {
    render(<PropertyDetailSection scorecard={makeScorecard(PROPERTY_DETAIL)} />);
    expect(screen.queryByText(/★/)).toBeNull();
    expect(screen.queryByText(/percentile/i)).toBeNull();
  });

  it("renders the section with its export control when publicSample is false", () => {
    render(
      <PropertyDetailSection scorecard={makeScorecard(PROPERTY_DETAIL)} publicSample={false} />
    );
    expect(screen.getByText("Properties")).toBeTruthy();
    // Authenticated scorecard → the PropertyExportButton link is present.
    expect(screen.queryByRole("link", { name: /export/i })).toBeTruthy();
  });

  it("renders nothing when publicSample is true — property detail is gated + premium, not for the public sample", () => {
    const { container } = render(
      <PropertyDetailSection scorecard={makeScorecard(PROPERTY_DETAIL)} publicSample />
    );
    // The whole section is omitted on /sample — no table, no header, no export.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("The Oaks")).toBeNull();
    expect(screen.queryByText("Properties")).toBeNull();
  });
});
