import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketReportExitOffer } from "./MarketReportExitOffer";

const markets = [
  { id: "denver-co", label: "Denver, CO" },
  { id: "seattle-wa", label: "Seattle, WA" },
];

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
  vi.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: true }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function triggerExitIntent() {
  act(() => vi.advanceTimersByTime(5_000));
  fireEvent.mouseOut(document, { clientY: 0, relatedTarget: null });
}

describe("MarketReportExitOffer", () => {
  it("opens once exit intent is detected", () => {
    render(<MarketReportExitOffer markets={markets} />);
    triggerExitIntent();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/See what is changing/)).toBeTruthy();
  });

  it("submits the selected market and email and confirms delivery", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ delivered: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketReportExitOffer markets={markets} />);
    triggerExitIntent();
    fireEvent.change(screen.getByLabelText("Home market"), {
      target: { value: "denver-co" },
    });
    fireEvent.change(screen.getByLabelText("Work email"), {
      target: { value: "owner@example.com" },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Email my free report" })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      marketId: "denver-co",
      email: "owner@example.com",
      source: "homepage_exit_intent",
    });
    expect(screen.getByText("Check your inbox.")).toBeTruthy();
    expect(window.localStorage.getItem("dwellsy_market_report_received")).toBe("1");
  });
});
