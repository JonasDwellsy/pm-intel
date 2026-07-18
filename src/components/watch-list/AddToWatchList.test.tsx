// Component test for the "Add to watch list" island (v0.27, Task 6).
// Mocks @clerk/nextjs's useAuth (signed-in) and global fetch — no real
// network / DB / Clerk session needed. Follows the ValueInput.test.tsx
// pattern: RTL + userEvent, role/text queries, assert the fetch contract
// rather than round-tripping state through a parent.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddToWatchList } from "./AddToWatchList";

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => useAuthMock(),
}));

const PINNED_A = { id: "list-a", name: "Denver watch", kind: "pinned", ownerId: "user_1" };
const PINNED_B = { id: "list-b", name: "Austin watch", kind: "pinned", ownerId: "user_1" };
const CRITERIA_LIST = { id: "list-c", name: "Smart list", kind: "criteria", ownerId: "user_1" };
const OTHER_OWNER_PINNED = { id: "list-d", name: "Not mine", kind: "pinned", ownerId: "user_2" };

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

/** Fetch router covering the endpoints AddToWatchList calls:
 *    GET  /api/watch-lists
 *    GET  /api/watch-lists/:id/members
 *    POST/DELETE /api/watch-lists/:id/members
 *    POST /api/watch-lists (create)
 *  list-a starts pinned to "doorby"; list-b does not. A freshly created
 *  list ("list-new") starts with no members. */
function makeFetchMock() {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url === "/api/watch-lists" && method === "GET") {
      return jsonResponse({
        watchListes: [PINNED_A, PINNED_B, CRITERIA_LIST, OTHER_OWNER_PINNED],
      });
    }
    if (url === "/api/watch-lists" && method === "POST") {
      const body = parseBody(init);
      return jsonResponse(
        {
          watchList: {
            id: "list-new",
            name: body.name,
            kind: body.kind,
            ownerId: "user_1",
          },
        },
        201
      );
    }
    if (url === "/api/watch-lists/list-a/members" && method === "GET") {
      return jsonResponse({ members: [{ memberKey: "doorby" }] });
    }
    if (url === "/api/watch-lists/list-b/members" && method === "GET") {
      return jsonResponse({ members: [] });
    }
    if (url === "/api/watch-lists/list-new/members" && method === "GET") {
      return jsonResponse({ members: [] });
    }
    if (/^\/api\/watch-lists\/[^/]+\/members$/.test(url) && (method === "POST" || method === "DELETE")) {
      return jsonResponse({ ok: true });
    }
    throw new Error(`Unhandled fetch in test: ${method} ${url}`);
  });
}

let fetchMock: ReturnType<typeof makeFetchMock>;

beforeEach(() => {
  useAuthMock.mockReturnValue({ isSignedIn: true, userId: "user_1" });
  fetchMock = makeFetchMock();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddToWatchList", () => {
  it("renders the bookmark trigger button", () => {
    render(<AddToWatchList memberKey="doorby" operatorName="Doorby" />);
    expect(
      screen.getByRole("button", { name: "Add to watch list" })
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing for a signed-out visitor", () => {
    useAuthMock.mockReturnValue({ isSignedIn: false, userId: null });
    const { container } = render(
      <AddToWatchList memberKey="doorby" operatorName="Doorby" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not flicker null while Clerk is still resolving (isSignedIn === undefined)", () => {
    // Fix 2: only a CONFIRMED signed-out state (isSignedIn === false)
    // hides the control — mirrors GatedLink. Treating the resolving
    // state as signed-out would render null, then pop the bookmark in
    // once Clerk settles; rendering the control throughout resolving
    // means the (far more common, on these authenticated hosts)
    // signed-in case never flickers.
    useAuthMock.mockReturnValue({ isSignedIn: undefined, userId: undefined });
    const { container } = render(
      <AddToWatchList memberKey="doorby" operatorName="Doorby" />
    );
    expect(container.firstChild).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Add to watch list" })
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opening the popover lists all the caller's OWN lists (pinned + smart), not other owners'", async () => {
    const user = userEvent.setup();
    render(<AddToWatchList memberKey="doorby" operatorName="Doorby" />);

    await user.click(screen.getByRole("button", { name: "Add to watch list" }));

    await waitFor(() => {
      expect(screen.getByText("Denver watch")).toBeTruthy();
    });
    expect(screen.getByText("Austin watch")).toBeTruthy();
    // A "criteria"-kind (smart) list owned by the caller is now a valid
    // pin target; another user's pinned list is still excluded by the
    // owner-only gate.
    expect(screen.getByText("Smart list")).toBeTruthy();
    expect(screen.queryByText("Not mine")).toBeNull();

    // Membership resolved per list (a second fetch fan-out, after the
    // list names render) — list-a already carries "doorby", list-b
    // doesn't, so wait for that second round-trip to settle.
    const denverRow = screen.getByText("Denver watch").closest("label")!;
    const austinRow = screen.getByText("Austin watch").closest("label")!;
    await waitFor(() => {
      expect(within(denverRow).getByRole("checkbox")).toHaveProperty("checked", true);
    });
    expect(within(austinRow).getByRole("checkbox")).toHaveProperty("checked", false);
  });

  it("toggling a checkbox fires the members POST/DELETE with the right memberKey + list id", async () => {
    const user = userEvent.setup();
    render(<AddToWatchList memberKey="doorby" operatorName="Doorby" />);
    await user.click(screen.getByRole("button", { name: "Add to watch list" }));
    await waitFor(() => screen.getByText("Denver watch"));

    // Denver (list-a) starts pinned — wait for the membership fan-out to
    // resolve (checkbox flips true) before unchecking it, or the click
    // would race the fetch and toggle the wrong direction.
    const denverRow = screen.getByText("Denver watch").closest("label")!;
    await waitFor(() => {
      expect(within(denverRow).getByRole("checkbox")).toHaveProperty("checked", true);
    });
    await user.click(within(denverRow).getByRole("checkbox"));

    await waitFor(() => {
      // The membership-check GET during load also hit this same URL, so
      // match on method too — not just the URL — to isolate the toggle's
      // own request.
      const call = fetchMock.mock.calls.find(
        ([u, init]) =>
          String(u) === "/api/watch-lists/list-a/members" &&
          (init as RequestInit | undefined)?.method === "DELETE"
      );
      expect(call).toBeTruthy();
      const [, init] = call!;
      expect(parseBody(init as RequestInit)).toEqual({ memberKey: "doorby" });
    });

    // Austin (list-b) starts unpinned — checking it should POST.
    const austinRow = screen.getByText("Austin watch").closest("label")!;
    await user.click(within(austinRow).getByRole("checkbox"));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) =>
          String(u) === "/api/watch-lists/list-b/members" &&
          (init as RequestInit | undefined)?.method === "POST"
      );
      expect(call).toBeTruthy();
      const [, init] = call!;
      expect(parseBody(init as RequestInit)).toEqual({ memberKey: "doorby" });
    });
  });

  it("the create-new flow POSTs a new pinned list, then pins the memberKey into it", async () => {
    const user = userEvent.setup();
    render(<AddToWatchList memberKey="doorby" operatorName="Doorby" />);
    await user.click(screen.getByRole("button", { name: "Add to watch list" }));
    await waitFor(() => screen.getByText("Denver watch"));

    await user.click(screen.getByRole("button", { name: "＋ New list…" }));
    await user.type(
      screen.getByLabelText("New watch list name"),
      "My new pins"
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([u, init]) =>
          String(u) === "/api/watch-lists" &&
          (init as RequestInit | undefined)?.method === "POST"
      );
      expect(createCall).toBeTruthy();
      const [, init] = createCall!;
      expect(parseBody(init as RequestInit)).toEqual({
        name: "My new pins",
        kind: "pinned",
        requiredCriteria: [],
        preferredCriteria: [],
        excludedCriteria: [],
      });
    });

    await waitFor(() => {
      const pinCall = fetchMock.mock.calls.find(
        ([u]) => String(u) === "/api/watch-lists/list-new/members"
      );
      expect(pinCall).toBeTruthy();
      const [, init] = pinCall!;
      expect((init as RequestInit).method).toBe("POST");
      expect(parseBody(init as RequestInit)).toEqual({ memberKey: "doorby" });
    });

    // The new list now appears, checked, alongside the existing two.
    await waitFor(() => {
      expect(screen.getByText("My new pins")).toBeTruthy();
    });
    const newRow = screen.getByText("My new pins").closest("label")!;
    expect(within(newRow).getByRole("checkbox")).toHaveProperty("checked", true);
  });

  it("Fix 3: if the pin POST fails after create succeeds, the new list still appears (unchecked) instead of vanishing", async () => {
    // A retry from this state must pin the EXISTING list via its
    // checkbox (a members POST), not re-run the create flow and mint a
    // duplicate list.
    let pinAttempts = 0;
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (url === "/api/watch-lists" && method === "GET") {
        return jsonResponse({
          watchListes: [PINNED_A, PINNED_B, CRITERIA_LIST, OTHER_OWNER_PINNED],
        });
      }
      if (url === "/api/watch-lists" && method === "POST") {
        const body = parseBody(init);
        return jsonResponse(
          { watchList: { id: "list-new", name: body.name, kind: body.kind, ownerId: "user_1" } },
          201
        );
      }
      if (url === "/api/watch-lists/list-a/members" && method === "GET") {
        return jsonResponse({ members: [{ memberKey: "doorby" }] });
      }
      if (url === "/api/watch-lists/list-b/members" && method === "GET") {
        return jsonResponse({ members: [] });
      }
      if (url === "/api/watch-lists/list-new/members" && method === "POST") {
        pinAttempts += 1;
        // First pin attempt (right after create) fails; a retry succeeds.
        if (pinAttempts === 1) return jsonResponse({ error: "boom" }, 500);
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled fetch in test: ${method} ${url}`);
    });

    const user = userEvent.setup();
    render(<AddToWatchList memberKey="doorby" operatorName="Doorby" />);
    await user.click(screen.getByRole("button", { name: "Add to watch list" }));
    await waitFor(() => screen.getByText("Denver watch"));

    await user.click(screen.getByRole("button", { name: "＋ New list…" }));
    await user.type(screen.getByLabelText("New watch list name"), "My new pins");
    await user.click(screen.getByRole("button", { name: "Create" }));

    // The list appears despite the pin POST failing, and settles unchecked.
    await waitFor(() => {
      expect(screen.getByText("My new pins")).toBeTruthy();
    });
    const newRow = screen.getByText("My new pins").closest("label")!;
    await waitFor(() => {
      expect(within(newRow).getByRole("checkbox")).toHaveProperty("checked", false);
    });
    expect(screen.getByRole("alert").textContent).toMatch(/failed to update watch list/i);

    // Exactly one create POST fired — the create form is also closed
    // (no orphaned "creating…" state to retry from).
    const createCalls = fetchMock.mock.calls.filter(
      ([u, init]) =>
        String(u) === "/api/watch-lists" &&
        (init as RequestInit | undefined)?.method === "POST"
    );
    expect(createCalls).toHaveLength(1);
    expect(screen.queryByLabelText("New watch list name")).toBeNull();

    // Retry via the checkbox pins the EXISTING list-new — no second create.
    await user.click(within(newRow).getByRole("checkbox"));
    await waitFor(() => {
      expect(within(newRow).getByRole("checkbox")).toHaveProperty("checked", true);
    });
    expect(
      fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u) === "/api/watch-lists" &&
          (init as RequestInit | undefined)?.method === "POST"
      )
    ).toHaveLength(1);
    expect(pinAttempts).toBe(2);
  });
});
