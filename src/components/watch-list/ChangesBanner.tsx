import Link from "next/link";
import type { ChangeBreakdown } from "@/lib/watch-list/change-detection";

// v0.16 — Banner that summarises operator movement since the user's
// last visit. Renders at the top of /watch-lists/[id]/results.
//
// Suppressed entirely when:
//   - No operators moved (breakdown.operatorCount === 0)
//   - User hasn't visited this watch list before (firstVisit) — the
//     parent passes a null breakdown in that case so we never render.
//
// Click-through navigates to /watch-lists/[id]/changes for the
// detail table. Acknowledgement is implicit — the parent page's
// WatchListView write has already happened by the time this
// renders, so on the next page load this banner won't appear
// unless something else has shifted.

interface Props {
  watchListId: string;
  breakdown: ChangeBreakdown;
}

export function ChangesBanner({ watchListId, breakdown }: Props) {
  if (breakdown.operatorCount === 0) return null;

  const operatorLabel =
    breakdown.operatorCount === 1 ? "operator moved" : "operators moved";

  // Assemble the per-type breakdown copy. Each segment renders only
  // when its count > 0, joined with commas. Singular/plural handled
  // inline because the categories don't share grammatical structure.
  const segments: string[] = [];
  if (breakdown.starChanges > 0) {
    segments.push(
      `${breakdown.starChanges} star change${breakdown.starChanges === 1 ? "" : "s"}`
    );
  }
  if (breakdown.portfolioChanges > 0) {
    segments.push(
      `${breakdown.portfolioChanges} portfolio shift${breakdown.portfolioChanges === 1 ? "" : "s"}`
    );
  }
  if (breakdown.marketEntries > 0) {
    segments.push(
      `${breakdown.marketEntries} new market ${breakdown.marketEntries === 1 ? "entry" : "entries"}`
    );
  }
  if (breakdown.marketDrops > 0) {
    segments.push(
      `${breakdown.marketDrops} market exit${breakdown.marketDrops === 1 ? "" : "s"}`
    );
  }
  if (breakdown.submarketChanges > 0) {
    segments.push(
      `${breakdown.submarketChanges} submarket shift${breakdown.submarketChanges === 1 ? "" : "s"}`
    );
  }
  if (breakdown.concessionChanges > 0) {
    segments.push(
      `${breakdown.concessionChanges} concession move${breakdown.concessionChanges === 1 ? "" : "s"}`
    );
  }
  if (breakdown.eligibilityChanges > 0) {
    segments.push(
      `${breakdown.eligibilityChanges} eligibility flip${breakdown.eligibilityChanges === 1 ? "" : "s"}`
    );
  }

  return (
    <Link
      href={`/watch-lists/${watchListId}/changes`}
      className="group mb-6 block rounded-md border border-teal-200 bg-teal-soft px-5 py-3.5 transition-colors hover:border-teal hover:bg-teal-100/60"
    >
      <p className="text-[14px] font-semibold text-navy">
        <span className="dq-mono text-navy">{breakdown.operatorCount}</span>{" "}
        {operatorLabel} since your last visit
        {segments.length > 0 && (
          <span className="font-medium text-foreground/75">
            {" · "}
            {segments.join(", ")}
          </span>
        )}
        <span aria-hidden className="ml-2 text-teal group-hover:text-teal-700">
          →
        </span>
      </p>
    </Link>
  );
}
