// Exemplar component/interaction test — the first UI test in the codebase.
// Covers the market picker's search + bulk controls (added when the market
// list outgrew a flat chip wall). Proves the harness can render a real "use
// client" component, drive it with user events, and assert both rendered
// output and the onChange contract — no DB / Clerk / network needed.
//
// Pattern to evaluate with Yana: RTL + userEvent, role/text queries (no test
// ids), assert the callback contract for controlled inputs rather than
// round-tripping state through a parent.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValueInput } from "./ValueInput";
import type { InputDescriptor, MarketOption } from "@/lib/watch-list/editor-options";

const MARKETS: MarketOption[] = [
  { id: "denver-co", label: "Denver, CO" },
  { id: "austin-tx", label: "Austin, TX" },
  { id: "boise-id", label: "Boise, ID" },
];

const marketsDescriptor: InputDescriptor = {
  kind: "enumChips",
  dynamicOptions: "markets",
  allowMulti: true,
};

function renderPicker(value: string[] = [], onChange = vi.fn()) {
  render(
    <ValueInput
      descriptor={marketsDescriptor}
      value={value}
      onChange={onChange}
      marketOptions={MARKETS}
    />
  );
  return onChange;
}

describe("ValueInput — market picker (multi-select + search)", () => {
  it("renders a chip per market and a zero selected-count", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "Denver, CO" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Austin, TX" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Boise, ID" })).toBeTruthy();
    expect(screen.getByText("0 selected")).toBeTruthy();
  });

  it("filters the chips as the user types in the search box", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByPlaceholderText("Search markets…"), "aus");
    expect(screen.getByRole("button", { name: "Austin, TX" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Denver, CO" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Boise, ID" })).toBeNull();
  });

  it("'Select all' submits every visible market and 'Clear' submits none", async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(onChange).toHaveBeenLastCalledWith(["denver-co", "austin-tx", "boise-id"]);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("reflects the controlled selection in the count", () => {
    renderPicker(["denver-co", "austin-tx"]);
    expect(screen.getByText("2 selected")).toBeTruthy();
  });
});
