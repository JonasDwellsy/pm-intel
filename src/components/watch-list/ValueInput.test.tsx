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

// ─── Size band picker ────────────────────────────────────────────────
//
// The whole point of the band field is that nobody types a unit count into
// the watch-list builder again — calibration against operator-reported counts
// showed the point estimate is 2-4x low for apartment-heavy operators, and the
// residual is coverage we can't recover. So these assert the CONTROL, not just
// the value contract: if this silently fell back to a number box, the product
// would be inviting exactly the precision claim it retired.

describe("ValueInput — size band picker (ordinal select)", () => {
  const bandDescriptor: InputDescriptor = {
    kind: "ordinal",
    ordinalOptions: [
      { value: 0, label: "<50" },
      { value: 3, label: "200–400" },
      { value: 5, label: "800–1,600" },
    ],
  };

  it("renders a labelled select, never a free-text number input", () => {
    render(<ValueInput descriptor={bandDescriptor} value={undefined} onChange={vi.fn()} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeTruthy();
    expect(document.querySelector('input[type="number"]')).toBeNull();
    expect(screen.getByRole("option", { name: "200–400 units" })).toBeTruthy();
  });

  it("stores the band INDEX, not the unit count — that is what keeps gte ordinal", async () => {
    const onChange = vi.fn();
    render(<ValueInput descriptor={bandDescriptor} value={undefined} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "5");
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("clearing the selection emits null so the criterion reads as incomplete", async () => {
    const onChange = vi.fn();
    render(<ValueInput descriptor={bandDescriptor} value={3} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("`between` renders two band selects and emits an index pair", async () => {
    const onChange = vi.fn();
    render(
      <ValueInput
        descriptor={{ ...bandDescriptor, kind: "ordinalBetween" }}
        value={[null, null]}
        onChange={onChange}
      />
    );
    const [from, to] = screen.getAllByRole("combobox");
    expect(to).toBeTruthy();
    await userEvent.selectOptions(from, "3");
    expect(onChange).toHaveBeenCalledWith([3, null]);
  });
});
