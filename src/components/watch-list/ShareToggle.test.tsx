// Component test for the owner-only share toggle (final-review Fix 1).
// Follows the AddToWatchList.test.tsx pattern: RTL + userEvent, a stubbed
// global fetch, assert the PUT contract and optimistic-revert-on-failure
// behavior rather than round-tripping through a real API. next/navigation's
// useRouter is mocked since the component only calls router.refresh() as a
// post-success side effect (not asserted in detail here — refresh() has no
// observable DOM effect in this test's fetch-mocked setup).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareToggle } from "./ShareToggle";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  return init?.body ? JSON.parse(init.body as string) : {};
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refreshMock.mockClear();
  fetchMock = vi.fn(async () => jsonResponse({ watchList: {} }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShareToggle", () => {
  it("renders unchecked with 'Private' label when the list starts private", () => {
    render(<ShareToggle watchListId="wl-1" initialIsShared={false} />);
    const checkbox = screen.getByRole("checkbox", {
      name: "Share with my organization",
    });
    expect(checkbox).toHaveProperty("checked", false);
    expect(screen.getByText("Private")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders checked with 'Shared with org' label when the list starts shared", () => {
    render(<ShareToggle watchListId="wl-1" initialIsShared={true} />);
    const checkbox = screen.getByRole("checkbox", {
      name: "Share with my organization",
    });
    expect(checkbox).toHaveProperty("checked", true);
    expect(screen.getByText("Shared with org")).toBeTruthy();
  });

  it("checking the box PUTs { isShared: true } to /api/watch-lists/[id] and refreshes", async () => {
    const user = userEvent.setup();
    render(<ShareToggle watchListId="wl-1" initialIsShared={false} />);

    await user.click(
      screen.getByRole("checkbox", { name: "Share with my organization" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/watch-lists/wl-1",
        expect.objectContaining({ method: "PUT" })
      );
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(parseBody(init)).toEqual({ isShared: true });
    expect(screen.getByText("Shared with org")).toBeTruthy();
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("unchecking the box PUTs { isShared: false }", async () => {
    const user = userEvent.setup();
    render(<ShareToggle watchListId="wl-1" initialIsShared={true} />);

    await user.click(
      screen.getByRole("checkbox", { name: "Share with my organization" })
    );

    await waitFor(() => {
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(parseBody(init)).toEqual({ isShared: false });
    });
    expect(screen.getByText("Private")).toBeTruthy();
  });

  it("reverts the checkbox and surfaces an error when the PUT fails", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: "boom" }, 500));
    const user = userEvent.setup();
    render(<ShareToggle watchListId="wl-1" initialIsShared={false} />);

    await user.click(
      screen.getByRole("checkbox", { name: "Share with my organization" })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Share with my organization" })
      ).toHaveProperty("checked", false);
    });
    expect(screen.getByText("Private")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/failed to update sharing/i);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
