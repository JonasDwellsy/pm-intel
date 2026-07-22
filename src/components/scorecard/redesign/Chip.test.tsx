import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders its children", () => {
    render(<Chip>SFR independent</Chip>);
    expect(screen.getByText("SFR independent")).toBeTruthy();
  });

  it("renders the cohort dot only when dot is set", () => {
    const { container, rerender } = render(<Chip>Type</Chip>);
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(0);
    rerender(<Chip dot>Type</Chip>);
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(1);
  });

  it("exposes infoTitle via an accessible label when set", () => {
    render(<Chip infoTitle="High confidence · inferred from listing structure">Third-party manager</Chip>);
    expect(screen.getByLabelText("High confidence · inferred from listing structure")).toBeTruthy();
  });

  it("renders no info affordance without infoTitle", () => {
    render(<Chip>Stockton, CA MSA</Chip>);
    expect(screen.queryByText("ⓘ")).toBeNull();
  });
});
