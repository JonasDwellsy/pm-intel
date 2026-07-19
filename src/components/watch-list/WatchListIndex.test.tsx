// Component test for the /watch-lists index cards (Task 3 — content-
// descriptor cards). Follows the ShareToggle.test.tsx pattern:
// next/navigation's useRouter is mocked (WatchListIndex only calls
// router.push on duplicate, not exercised here) and global fetch is
// stubbed so nothing round-trips through a real API.
//
// Fixtures build the minimal WatchListRecord shape (see
// src/lib/watch-list/store.ts + scoring.ts's WatchListDefinition) —
// criteria arrays only need a length, their contents aren't read by
// the card body.
//
// Covers the three body states derived by deriveListKind (kind.ts):
//   - pins only ("pinned")  → "{n} operators" line, no jargon pill
//   - criteria only ("smart") → required/preferred/excluded chips
//   - both ("hybrid")         → chips AND the operators line
// No card renders a "Pick list" or "Hybrid" pill span anymore — the
// kind still drives which body renders, it just isn't announced as a
// label on the card.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WatchListRecord } from "@/lib/watch-list/store";
import { WatchListIndex } from "./WatchListIndex";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function makeRecord(overrides: Partial<WatchListRecord>): WatchListRecord {
  return {
    id: "list-1",
    name: "Untitled list",
    description: null,
    requiredCriteria: [],
    preferredCriteria: [],
    excludedCriteria: [],
    ownerId: "user_1",
    organizationId: "org_1",
    isShared: false,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

const OPERATORS_ONLY = makeRecord({
  id: "list-operators",
  name: "Pinned operators",
});

const CRITERIA_ONLY = makeRecord({
  id: "list-criteria",
  name: "Smart criteria list",
  requiredCriteria: [{ field: "portfolioSize", operator: "gte", value: 500 }],
  preferredCriteria: [
    { field: "retention18mo", operator: "gte", value: 0.7, weight: 1 },
  ],
  excludedCriteria: [{ field: "state", operator: "eq", value: "CA" }],
});

const BOTH = makeRecord({
  id: "list-both",
  name: "Hybrid list",
  requiredCriteria: [{ field: "portfolioSize", operator: "gte", value: 500 }],
  preferredCriteria: [],
  excludedCriteria: [],
});

// Distinct pin count (5) from the required-chip count (1) so
// getByText below can't match the wrong "1" on the both-card.
const BOTH_PIN_COUNT = 5;

describe("WatchListIndex — content-descriptor cards", () => {
  it("an operators-only list shows the operator count and no jargon pill", () => {
    render(
      <WatchListIndex
        watchListes={[OPERATORS_ONLY]}
        pinnedCounts={{ [OPERATORS_ONLY.id]: 4 }}
      />
    );

    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("operators")).toBeTruthy();
    expect(screen.queryByText("Pick list")).toBeNull();
    expect(screen.queryByText("Hybrid")).toBeNull();
  });

  it("a criteria-only list shows the required/preferred/excluded chips", () => {
    render(
      <WatchListIndex
        watchListes={[CRITERIA_ONLY]}
        pinnedCounts={{ [CRITERIA_ONLY.id]: 0 }}
      />
    );

    expect(screen.getByText("required")).toBeTruthy();
    expect(screen.getByText("preferred")).toBeTruthy();
    expect(screen.getByText("excluded")).toBeTruthy();
    expect(screen.queryByText("Pick list")).toBeNull();
    expect(screen.queryByText("Hybrid")).toBeNull();
  });

  it("a list with both criteria and pins shows the chips AND the operators line", () => {
    render(
      <WatchListIndex
        watchListes={[BOTH]}
        pinnedCounts={{ [BOTH.id]: BOTH_PIN_COUNT }}
      />
    );

    expect(screen.getByText("required")).toBeTruthy();
    expect(screen.getByText("preferred")).toBeTruthy();
    expect(screen.getByText("excluded")).toBeTruthy();
    // Distinct from the required/preferred/excluded chip counts (1/0/0)
    // so this can't accidentally match the wrong number on the card.
    expect(screen.getByText(String(BOTH_PIN_COUNT))).toBeTruthy();
    expect(screen.getByText("operators")).toBeTruthy();
    expect(screen.queryByText("Pick list")).toBeNull();
    expect(screen.queryByText("Hybrid")).toBeNull();
  });
});
