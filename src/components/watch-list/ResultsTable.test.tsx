// Component test for the "Pinned" / "Pinned + matches" badge (hybrid
// watch-lists work, thread-matched-flag task). ResultRowVM carries ~30
// required fields, so rendering the full <ResultsTable> for a 3-case
// badge check would need a large fixture; PinnedMatchBadge is exported
// from ResultsTable.tsx as the exact presentational unit the table's
// name column renders, so testing it directly is honest (real JSX, real
// DOM query) without the fixture weight. Follows the ValueInput.test.tsx
// idiom: RTL, role/text queries, no test ids.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinnedMatchBadge } from "./ResultsTable";

describe("PinnedMatchBadge", () => {
  it("pinned + matched renders 'Pinned + matches', not plain 'Pinned'", () => {
    render(<PinnedMatchBadge pinned={true} matched={true} />);
    expect(screen.getByText("Pinned + matches")).toBeTruthy();
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("pinned only (not matched) renders plain 'Pinned', not 'Pinned + matches'", () => {
    render(<PinnedMatchBadge pinned={true} matched={false} />);
    expect(screen.getByText("Pinned")).toBeTruthy();
    expect(screen.queryByText("Pinned + matches")).toBeNull();
  });

  it("matched but not pinned renders no badge at all", () => {
    const { container } = render(
      <PinnedMatchBadge pinned={false} matched={true} />
    );
    expect(screen.queryByText("Pinned")).toBeNull();
    expect(screen.queryByText("Pinned + matches")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
