// Component test for the "Watch operators" search-and-add modal
// (operator-roster watch lists, Task 2). Mirrors the AddToWatchList.test.tsx
// / SearchResultRow.test.tsx conventions: RTL + userEvent, mocked Clerk
// auth, a stubbed global fetch, and a mocked next/navigation router.
//
// @/lib/pm-search's searchPMs + filterResultsByEntitlement are mocked so
// the test doesn't depend on the real Fuse index / seed data — but
// operatorMemberKey is NOT mocked, so this test exercises the real
// slug -> memberKey derivation (shared with SearchResultRow via
// src/lib/watch-list/operator-member-key.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatchOperatorsModal } from "./WatchOperatorsModal";
import type { PMSearchResult } from "@/lib/pm-search";

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => useAuthMock(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const searchPMsMock = vi.fn();
const filterResultsByEntitlementMock = vi.fn(
  (results: PMSearchResult[]) => results
);
vi.mock("@/lib/pm-search", () => ({
  searchPMs: (...args: unknown[]) =>
    (searchPMsMock as (...a: unknown[]) => PMSearchResult[])(...args),
  filterResultsByEntitlement: (...args: unknown[]) =>
    (
      filterResultsByEntitlementMock as (
        ...a: unknown[]
      ) => PMSearchResult[]
    )(...args),
}));

vi.mock("@/components/search/useEntitledMarkets", () => ({
  useEntitledMarkets: () => "all",
}));

// Two real ranked-tier results with distinct slugs — the operator-tier
// memberKey path (result.slug) is what the modal's real
// operatorMemberKey() derivation resolves to.
const RESULT_A: PMSearchResult = {
  tier: "ranked",
  name: "Acme Residential",
  slug: "acme-residential-co",
  marketId: "denver-co",
  marketCity: "Denver",
  stateCode: "CO",
  stateSlug: "colorado",
  citySlug: "denver",
  goldCount: 0,
  silverCount: 0,
  t12Listings: 12,
  href: "/property-managers/colorado/denver/acme-residential-co",
  score: 0,
} as PMSearchResult;

const RESULT_B: PMSearchResult = {
  tier: "ranked",
  name: "Beacon Property Group",
  slug: "beacon-property-group-co",
  marketId: "denver-co",
  marketCity: "Denver",
  stateCode: "CO",
  stateSlug: "colorado",
  citySlug: "denver",
  goldCount: 0,
  silverCount: 0,
  t12Listings: 8,
  href: "/property-managers/colorado/denver/beacon-property-group-co",
  score: 0,
} as PMSearchResult;

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

    if (url === "/api/watch-lists" && method === "POST") {
      return jsonResponse({ watchList: { id: "list-99" } }, 201);
    }
    if (
      /^\/api\/watch-lists\/list-99\/members$/.test(url) &&
      method === "POST"
    ) {
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
  searchPMsMock.mockReset();
  searchPMsMock.mockReturnValue([RESULT_A, RESULT_B]);
  filterResultsByEntitlementMock.mockClear();
  filterResultsByEntitlementMock.mockImplementation(
    (results: PMSearchResult[]) => results
  );
  pushMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WatchOperatorsModal", () => {
  it("typing a query renders the two search results", async () => {
    const user = userEvent.setup();
    render(<WatchOperatorsModal open={true} onClose={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Search operators by name..."),
      "acme"
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Residential")).toBeTruthy();
    });
    expect(screen.getByText("Beacon Property Group")).toBeTruthy();
  });

  it("clicking both results adds two chips, then Create & watch creates the list and pins both, and routes to the results page", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WatchOperatorsModal open={true} onClose={onClose} />);

    await user.type(
      screen.getByPlaceholderText("Search operators by name..."),
      "acme"
    );
    await waitFor(() => screen.getByText("Acme Residential"));

    await user.click(screen.getByRole("option", { name: /Acme Residential/ }));
    await user.click(
      screen.getByRole("option", { name: /Beacon Property Group/ })
    );

    // Two removable chips now render — the unambiguous proof of
    // selection (the row text alone would also match the source row).
    expect(
      screen.getByRole("button", { name: "Remove Acme Residential" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove Beacon Property Group" })
    ).toBeTruthy();

    await user.type(screen.getByLabelText("List name"), "My Roster");

    expect(
      screen.getByRole("button", { name: "Create & watch" })
    ).toHaveProperty("disabled", false);

    await user.click(screen.getByRole("button", { name: "Create & watch" }));

    // Exactly one create POST, with the expected body.
    await waitFor(() => {
      const createCalls = fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u) === "/api/watch-lists" &&
          (init as RequestInit | undefined)?.method === "POST"
      );
      expect(createCalls).toHaveLength(1);
      const [, init] = createCalls[0];
      expect(parseBody(init as RequestInit)).toEqual({
        name: "My Roster",
        requiredCriteria: [],
        preferredCriteria: [],
        excludedCriteria: [],
      });
    });

    // Two member POSTs, one per slug (order-independent — they fan out
    // via Promise.allSettled in the shared helper).
    await waitFor(() => {
      const memberCalls = fetchMock.mock.calls.filter(
        ([u, init]) =>
          String(u) === "/api/watch-lists/list-99/members" &&
          (init as RequestInit | undefined)?.method === "POST"
      );
      expect(memberCalls).toHaveLength(2);
      const keys = memberCalls
        .map(([, init]) => parseBody(init as RequestInit).memberKey)
        .sort();
      expect(keys).toEqual(
        ["acme-residential-co", "beacon-property-group-co"].sort()
      );
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/watch-lists/list-99/results");
    });
  });

  it("Create & watch is disabled until at least one operator is selected and the name is non-empty", async () => {
    const user = userEvent.setup();
    render(<WatchOperatorsModal open={true} onClose={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Create & watch" })
    ).toHaveProperty("disabled", true);

    await user.type(
      screen.getByPlaceholderText("Search operators by name..."),
      "acme"
    );
    await waitFor(() => screen.getByText("Acme Residential"));
    await user.click(screen.getByRole("option", { name: /Acme Residential/ }));

    // One operator selected but no name yet — still disabled.
    expect(
      screen.getByRole("button", { name: "Create & watch" })
    ).toHaveProperty("disabled", true);

    await user.type(screen.getByLabelText("List name"), "My Roster");
    expect(
      screen.getByRole("button", { name: "Create & watch" })
    ).toHaveProperty("disabled", false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
