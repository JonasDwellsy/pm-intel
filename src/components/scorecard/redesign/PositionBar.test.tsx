import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { PositionBar } from "./PositionBar";
import { MARKETING_GOLD_MIN, MARKETING_SILVER_MIN } from "@/lib/scorecard/labels";

// The bar carries the whole visual claim about where an operator stands, so
// its reference marks have to describe the scale it is actually plotting.
// Marketing is scored on an absolute bar (gold 80 / silver 70); leaving the
// cohort's P25/med/P75 ticks under an absolute score invites the reader to
// interpret a 0-100 quality score as a percentile.

const marker = (c: HTMLElement) =>
  c.querySelector('span[style*="translateX(-50%)"][style*="height: 16px"]') as HTMLElement | null;

describe("cohort default", () => {
  test("ticks read as a peer distribution", () => {
    const { container } = render(<PositionBar position={0.6} />);
    expect(container.textContent).toContain("P25");
    expect(container.textContent).toContain("med");
    expect(container.textContent).toContain("P75");
  });

  test("the marker sits at the position", () => {
    const { container } = render(<PositionBar position={0.6} />);
    expect(marker(container)?.style.left).toBe("60.0%");
  });
});

describe("absolute variant", () => {
  const ticks = [
    { at: MARKETING_SILVER_MIN / 100, label: `silver ${MARKETING_SILVER_MIN}` },
    { at: MARKETING_GOLD_MIN / 100, label: `gold ${MARKETING_GOLD_MIN}` },
  ];

  test("ticks name the award thresholds, not quartiles", () => {
    const { container } = render(<PositionBar position={0.84} ticks={ticks} />);
    expect(container.textContent).toContain("silver 70");
    expect(container.textContent).toContain("gold 80");
    expect(container.textContent).not.toContain("P25");
    expect(container.textContent).not.toContain("med");
  });

  test("thresholds sit at their true fraction of the track", () => {
    const { container } = render(<PositionBar position={0.84} ticks={ticks} />);
    const spans = [...container.querySelectorAll("span")];
    expect(spans.find((s) => s.textContent === "silver 70")?.style.left).toBe("70%");
    expect(spans.find((s) => s.textContent === "gold 80")?.style.left).toBe("80%");
  });

  test("a gold score lands past the gold tick", () => {
    const { container } = render(<PositionBar position={0.843} ticks={ticks} />);
    const left = parseFloat(marker(container)!.style.left);
    expect(left).toBeGreaterThan(MARKETING_GOLD_MIN);
  });

  test("a poor score lands near the left, however good its cohort rank", () => {
    // Emerald Management: composite 25.6, 100th percentile in its cohort.
    const { container } = render(<PositionBar position={0.256} ticks={ticks} />);
    const left = parseFloat(marker(container)!.style.left);
    expect(left).toBeLessThan(MARKETING_SILVER_MIN);
    expect(left).toBeCloseTo(25.6, 1);
  });
});

describe("n/a state", () => {
  test("keeps its ticks and shows no marker", () => {
    const { container } = render(
      <PositionBar position={null} ticks={[{ at: 0.8, label: "gold 80" }]} />
    );
    expect(container.textContent).toContain("n/a");
    expect(container.textContent).toContain("gold 80");
    expect(marker(container)).toBeNull();
  });
});

test("position is clamped to the track", () => {
  expect(marker(render(<PositionBar position={1.4} />).container)?.style.left).toBe("100.0%");
  expect(marker(render(<PositionBar position={-0.3} />).container)?.style.left).toBe("0.0%");
});
