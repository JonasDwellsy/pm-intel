// Behavior test for the column-header info popover. The Properties table lives
// behind auth (gated off the public sample), so the interactive affordance is
// verified here rather than in a live page.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnInfoTip } from "./ColumnInfoTip";

const LABEL = "Median DOM";
const DESC = "Median days a listing stayed on the market before leasing.";

describe("ColumnInfoTip", () => {
  it("renders an accessible trigger and no popover until opened", () => {
    render(<ColumnInfoTip label={LABEL} description={DESC} />);
    expect(screen.getByRole("button", { name: `About ${LABEL}` })).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens the popover on click, showing the label and description", async () => {
    const user = userEvent.setup();
    render(<ColumnInfoTip label={LABEL} description={DESC} />);
    await user.click(screen.getByRole("button", { name: `About ${LABEL}` }));
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain(LABEL);
    expect(tip.textContent).toContain(DESC);
  });

  it("opens on hover and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ColumnInfoTip label={LABEL} description={DESC} />);
    await user.hover(screen.getByRole("button", { name: `About ${LABEL}` }));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ColumnInfoTip label={LABEL} description={DESC} />
        <button type="button">elsewhere</button>
      </div>
    );
    await user.click(screen.getByRole("button", { name: `About ${LABEL}` }));
    expect(screen.queryByRole("tooltip")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
