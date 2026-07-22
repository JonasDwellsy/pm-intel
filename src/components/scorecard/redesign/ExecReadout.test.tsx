import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecReadout } from "./ExecReadout";

describe("ExecReadout stars", () => {
  it("renders the gold/silver summary in the header when counts are provided", () => {
    render(<ExecReadout readout={[]} goldCount={2} silverCount={2} />);
    expect(screen.getByText(/2 gold/i)).toBeTruthy();
    expect(screen.getByText(/2 silver/i)).toBeTruthy();
  });

  it("renders no star summary when counts are omitted", () => {
    render(<ExecReadout readout={[]} />);
    expect(screen.queryByText(/gold/i)).toBeNull();
    expect(screen.queryByText(/silver/i)).toBeNull();
  });
});
