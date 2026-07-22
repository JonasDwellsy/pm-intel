import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HeaderView } from "@/lib/scorecard/view-model";

vi.mock("@/components/watch-list/AddToWatchList", () => ({
  AddToWatchList: (p: { primary?: boolean }) => (
    <button data-testid="watch">{p.primary ? "primary" : "default"}</button>
  ),
}));
vi.mock("@/components/scorecard/CopyLinkButton", () => ({
  CopyLinkButton: () => <button data-testid="copy">copy</button>,
}));
vi.mock("@/components/scorecard/PrintScorecardButton", () => ({
  PrintScorecardButton: () => <a data-testid="pdf">pdf</a>,
}));

import { ScorecardHeader } from "./ScorecardHeader";

const base: HeaderView = {
  name: "Reliance Real Estate",
  quadrant7Cell: "SFR Independent",
  managementModel: { model: "third_party", confidence: "high", basis: "Inferred from listing structure" },
  marketFullName: "Stockton, CA MSA",
  singleMarket: true,
  goldCount: 2,
  silverCount: 2,
  dwellsyCompanyUrl: "https://dwellsy.com/company/x",
  website: null,
  canonicalOperatorId: null,
} as unknown as HeaderView;

describe("ScorecardHeader", () => {
  it("folds scope into the market chip and shows the identity facts", () => {
    render(<ScorecardHeader header={base} slug="reliance-real-estate-stockton-ca" />);
    expect(screen.getByText("SFR Independent")).toBeTruthy();
    expect(screen.getByText("Third-party manager")).toBeTruthy();
    expect(screen.getByText("Stockton, CA MSA · single-market")).toBeTruthy();
  });

  it("does not render a standalone 'Single-market' chip", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.queryByText("Single-market")).toBeNull();
  });

  it("keeps the management-model confidence out of the visible text (tooltip only)", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.queryByText(/high confidence/i)).toBeNull();
  });

  it("no longer renders the star pill in the header", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.queryByText(/gold/i)).toBeNull();
    expect(screen.queryByText(/silver/i)).toBeNull();
  });

  it("renders the primary Watch action + compact utilities when not publicSample", () => {
    render(<ScorecardHeader header={base} slug="x" />);
    expect(screen.getByTestId("watch").textContent).toBe("primary");
    expect(screen.getByTestId("copy")).toBeTruthy();
    expect(screen.getByTestId("pdf")).toBeTruthy();
  });

  it("on publicSample: no Watch/copy/PDF, external link still renders", () => {
    render(<ScorecardHeader header={base} slug="x" publicSample />);
    expect(screen.queryByTestId("watch")).toBeNull();
    expect(screen.queryByTestId("copy")).toBeNull();
    expect(screen.queryByTestId("pdf")).toBeNull();
    expect(screen.getByText("Listings on Dwellsy")).toBeTruthy();
  });
});
