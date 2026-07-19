// Component test for Task 4 — the market multi-select roster builder.
// Mocks @clerk/nextjs's useAuth (signed-in) and global fetch, same pattern
// as AddToWatchList.test.tsx: no real network / DB / Clerk session needed.
// PMListItem (mounted per row) also renders GatedLink + AddToWatchList,
// both of which call useAuth() too — the single module-level mock below
// covers all three call sites.

import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RankedOperatorList } from "./RankedOperatorList";
import type { PMListItem as PMListItemData } from "@/lib/types";

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => useAuthMock(),
  // GatedLink renders <SignInButton> on the isSignedIn === false branch —
  // exercised by the "signed-out visitor" test below — as a plain
  // pass-through of its children (no real Clerk modal in this test env).
  SignInButton: ({ children }: { children: ReactNode }) => children,
}));

/** Minimal-but-real PMListItemData fixture — every required field on the
 *  interface, filled with plausible values, so PMListItem renders exactly
 *  as it does in prod (no stubbing away the memberKey derivation). */
function makeOperator(
  overrides: Partial<PMListItemData> & { slug: string; name: string }
): PMListItemData {
  return {
    quadrant: "MF/BTR / Institutional",
    quadrant7Cell: "mf_institutional",
    operatorType: "pm",
    hybrid: false,
    rankOverall: 1,
    rankOverallTotal: 10,
    rankQuadrant: 1,
    rankQuadrantTotal: 5,
    domT12: 24,
    totalObservedUnits: 500,
    primaryCity: "Austin",
    primaryCityShare: 40,
    claimed: false,
    rentVsComp: null,
    concessionRate: null,
    accentColor: null,
    coverageMapPoints: [],
    compositeStar: null,
    compositeCohortName: null,
    ...overrides,
  };
}

// OP_A has a canonicalOperatorId (multi-market operator) — its memberKey
// is that id, NOT its slug, per the fixed derivation (canonicalOperatorId
// ?? slug). OP_B and OP_C have none, so their memberKey falls back to slug.
const OP_A = makeOperator({
  slug: "acme-co-austin",
  name: "Acme Co",
  canonicalOperatorId: "canon-acme",
});
const OP_B = makeOperator({ slug: "borden-mgmt", name: "Borden Management" });
const OP_C = makeOperator({ slug: "cedar-park-homes", name: "Cedar Park Homes" });

const OWN_LIST = { id: "list-a", name: "Austin watch", ownerId: "user_1" };
const OTHER_OWNER_LIST = { id: "list-z", name: "Not mine", ownerId: "user_2" };

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

function makeFetchMock() {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url === "/api/watch-lists" && method === "GET") {
      return jsonResponse({ watchListes: [OWN_LIST, OTHER_OWNER_LIST] });
    }
    if (url === "/api/watch-lists" && method === "POST") {
      const body = parseBody(init);
      return jsonResponse(
        { watchList: { id: "list-new", name: body.name, ownerId: "user_1" } },
        201
      );
    }
    if (/^\/api\/watch-lists\/[^/]+\/members$/.test(url) && method === "POST") {
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

function renderList() {
  return render(
    <RankedOperatorList
      pms={[OP_A, OP_B, OP_C]}
      stateSlug="tx"
      citySlug="austin"
      submarket={null}
      marketHref="/property-managers/tx/austin"
      marketCity="Austin"
    />
  );
}

describe("RankedOperatorList — multi-select roster builder", () => {
  it("renders no checkboxes and no action bar until Select is toggled on", () => {
    renderList();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText(/selected/)).toBeNull();
    expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
  });

  it("hides the Select affordance entirely for a signed-out visitor", () => {
    useAuthMock.mockReturnValue({ isSignedIn: false, userId: null });
    renderList();
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });

  it("Select reveals a per-row checkbox; selecting two shows a '2 selected' action bar", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Select" }));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);

    await user.click(screen.getByRole("checkbox", { name: /Acme Co/ }));
    await user.click(screen.getByRole("checkbox", { name: /Borden Management/ }));

    expect(screen.getByText(/2 selected/)).toBeTruthy();
  });

  it("choosing the existing own list POSTs both memberKeys to its /members endpoint", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("checkbox", { name: /Acme Co/ }));
    await user.click(screen.getByRole("checkbox", { name: /Borden Management/ }));

    await user.click(screen.getByRole("button", { name: "Add to a watch list" }));

    await waitFor(() => {
      expect(screen.getByText("Austin watch")).toBeTruthy();
    });
    // Only the caller's own list is offered — never another org member's.
    expect(screen.queryByText("Not mine")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Austin watch" }));

    await waitFor(() => {
      const memberCalls = fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u) === "/api/watch-lists/list-a/members" &&
          (init as RequestInit | undefined)?.method === "POST"
      );
      expect(memberCalls).toHaveLength(2);
      const keys = memberCalls.map(
        ([, init]) => parseBody(init as RequestInit).memberKey
      );
      // OP_A's key is its canonicalOperatorId (NOT its slug); OP_B has none
      // so its key falls back to slug — the fixed canonicalOperatorId ??
      // slug derivation, identical to PMListItem's own AddToWatchList mount.
      expect(keys.sort()).toEqual(["borden-mgmt", "canon-acme"].sort());
    });

    // Selection + select mode clear after a successful add.
    await waitFor(() => {
      expect(screen.queryByText(/2 selected/)).toBeNull();
    });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("the '+ New list' path POSTs a create, then POSTs both memberKeys into the new list", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("checkbox", { name: /Acme Co/ }));
    await user.click(screen.getByRole("checkbox", { name: /Cedar Park Homes/ }));

    await user.click(screen.getByRole("button", { name: "Add to a watch list" }));
    await waitFor(() => screen.getByText("Austin watch"));

    await user.click(screen.getByRole("button", { name: "＋ New list…" }));
    await user.type(
      screen.getByLabelText("New watch list name"),
      "New Austin roster"
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
        name: "New Austin roster",
        requiredCriteria: [],
        preferredCriteria: [],
        excludedCriteria: [],
      });
    });

    await waitFor(() => {
      const memberCalls = fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u) === "/api/watch-lists/list-new/members" &&
          (init as RequestInit | undefined)?.method === "POST"
      );
      expect(memberCalls).toHaveLength(2);
      const keys = memberCalls.map(
        ([, init]) => parseBody(init as RequestInit).memberKey
      );
      expect(keys.sort()).toEqual(
        ["cedar-park-homes", "canon-acme"].sort()
      );
    });

    const createCalls = fetchMock.mock.calls.filter(
      ([u, init]) =>
        String(u) === "/api/watch-lists" &&
        (init as RequestInit | undefined)?.method === "POST"
    );
    expect(createCalls).toHaveLength(1);
  });
});
