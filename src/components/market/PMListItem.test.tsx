import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PMListItem } from "./PMListItem";
import type { PMListItem as Row } from "@/lib/types";

// PMListItem mounts AddToWatchList (Clerk useAuth) and routes through
// GatedLink when signed out. Signed-out is the right default: it exercises the
// row as an anonymous visitor browsing a market page sees it.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false, userId: null }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// These cover the two signals added to the market row: the inferred
// management model (the "can I hire them" gate, previously only on scorecards,
// watch lists and the PDF) and the concession rate (wired through after being
// hardcoded null while the pipeline had no concession data).

function row(over: Partial<Row> = {}): Row {
  return {
    slug: "acme-bozeman-mt",
    name: "Acme Property Management",
    quadrant: "Scattered / Independent",
    quadrant7Cell: "SFR Independent",
    operatorType: "pm",
    hybrid: false,
    rankOverall: null,
    rankOverallTotal: null,
    rankQuadrant: null,
    rankQuadrantTotal: null,
    domT12: 31,
    totalObservedUnits: 120,
    estManagedUnits: 400,
    primaryCity: "Bozeman",
    primaryCityShare: 80,
    claimed: false,
    rentVsComp: null,
    concessionRate: null,
    accentColor: null,
    coverageMapPoints: [],
    compositeStar: null,
    compositeCohortName: null,
    goldCount: 0,
    silverCount: 0,
    operatorStatus: "active",
    lastListingDate: null,
    ...over,
  } as Row;
}

const mount = (r: Row) =>
  render(
    <ul>
      <PMListItem pm={r} stateSlug="montana" citySlug="bozeman" submarket={null} />
    </ul>
  );

describe("PMListItem — management model", () => {
  it("labels a third-party manager", () => {
    mount(row({ managementModel: { model: "third_party", confidence: "high", basis: "Independent scattered single-family operator.", source: "listing" } }));
    expect(screen.getByText("Third-party manager")).toBeTruthy();
  });

  it("keeps the '(likely)' hedge on owner-operator", () => {
    // We infer this from listing shape; stating it flatly would overclaim.
    mount(row({ managementModel: { model: "owner_operator", confidence: "medium", basis: "Concentrated in own communities.", source: "listing" } }));
    expect(screen.getByText("Owner-operator (likely)")).toBeTruthy();
  });

  it("shows Unknown rather than hiding it", () => {
    // Unknown means "verify directly", not "no". Hiding it would read as an
    // answer we don't have.
    mount(row({ managementModel: { model: "unknown", confidence: null, basis: "Listings can't separate a large third-party manager from an owning REIT.", source: "listing" } }));
    expect(screen.getByText("Unknown")).toBeTruthy();
  });

  it("exposes the confidence and basis on hover", () => {
    mount(row({ managementModel: { model: "third_party", confidence: "high", basis: "Independent scattered operator.", source: "listing" } }));
    const chip = screen.getByText("Third-party manager");
    expect(chip.getAttribute("title")).toBe("High confidence · Independent scattered operator.");
  });

  it("renders no chip when the signal is absent", () => {
    mount(row({ managementModel: null }));
    for (const t of ["Third-party manager", "Owner-operator (likely)", "Unknown"]) {
      expect(screen.queryByText(t)).toBeNull();
    }
  });
});

describe("PMListItem — concessions", () => {
  it("shows the rate as a whole percentage", () => {
    mount(row({ concessionRate: 0.39 }));
    expect(screen.getByText("Concessions")).toBeTruthy();
    expect(screen.getByText("39%")).toBeTruthy();
  });

  it("distinguishes an observed 0% from a missing value", () => {
    // "advertises none" and "we have no rate" are different claims. Scope the
    // lookup to the concessions cell — "Rent vs comp" also renders "—" when
    // it has no value, so a bare getByText("—") is ambiguous.
    const cellValue = () =>
      screen.getByText("Concessions").parentElement?.querySelector("p:last-child")
        ?.textContent;
    const zero = mount(row({ concessionRate: 0 }));
    expect(cellValue()).toBe("0%");
    zero.unmount();
    mount(row({ concessionRate: null }));
    expect(cellValue()).toBe("—");
  });

  it("flags heavy discounting but stays neutral at ordinary levels", () => {
    // >=40% is where concession use stops being seasonal noise. Colouring
    // ordinary use would cry wolf.
    const heavy = mount(row({ concessionRate: 0.45 }));
    expect(screen.getByText("45%").className).toContain("text-orange");
    heavy.unmount();
    mount(row({ concessionRate: 0.15 }));
    expect(screen.getByText("15%").className).toContain("text-navy");
  });
});
