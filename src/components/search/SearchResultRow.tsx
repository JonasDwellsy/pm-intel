"use client";

import Link from "next/link";
import type { PMSearchResult } from "@/lib/pm-search";
import { AddToWatchList } from "@/components/watch-list/AddToWatchList";
import { operatorMemberKey } from "@/lib/watch-list/operator-member-key";

/** "May 27, 2026" from a plain YYYY-MM-DD, parsed as UTC so the date can't
 *  slip a day for anyone west of GMT. */
function fmtSearchDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Shared result-row primitive — rendered inside both the top-nav dropdown
// (SearchInput) and the Cmd+K modal (SearchModal). Both surfaces share
// the same row shape; the modal gets larger spacing via a `size` prop.

function StarChip({
  goldCount,
  silverCount,
}: {
  goldCount: number;
  silverCount: number;
}) {
  if (goldCount === 0 && silverCount === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground">
      {goldCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="gold" />
          {goldCount}
        </span>
      )}
      {silverCount > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <StarGlyph tone="silver" />
          {silverCount}
        </span>
      )}
    </span>
  );
}

function StarGlyph({ tone }: { tone: "gold" | "silver" }) {
  const fill = tone === "gold" ? "#E5A800" : "#9CA3AF";
  const stroke = tone === "gold" ? "#B98700" : "#6B7280";
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.7l-5.9 3.1 1.13-6.58L2.45 9.54l6.6-.96L12 2.6z" />
    </svg>
  );
}

export function SearchResultRow({
  result,
  active,
  onSelect,
  size = "compact",
}: {
  result: PMSearchResult;
  /** Highlight + scroll anchor for keyboard-nav arrow-key target. */
  active: boolean;
  /** Optional click handler — invoked alongside the Link navigation so
   *  the parent can close its overlay. */
  onSelect?: () => void;
  size?: "compact" | "comfortable";
}) {
  const padding = size === "comfortable" ? "px-5 py-3" : "px-4 py-2.5";
  const nameSize = size === "comfortable" ? "text-[15px]" : "text-[14px]";
  const subSize = size === "comfortable" ? "text-[12.5px]" : "text-[12px]";

  // v0.6.4 Patch 1 — canonical tier subtitle reads as a multi-market
  // footprint ("Operates in Phoenix, Memphis, Nashville · 4 markets")
  // rather than the single "City, ST" form ranked/tracked entries use.
  // Build it inline so the JSX tree stays one element per tier branch.
  const subtitle =
    result.tier === "canonical"
      ? (() => {
          const cities = result.markets
            .map((m) => m.marketCity)
            .slice(0, 4)
            .join(", ");
          const overflow =
            result.markets.length > 4 ? ` +${result.markets.length - 4}` : "";
          return (
            <>
              Operates in {cities}
              {overflow}
              <span className="mx-1.5 text-muted-2">·</span>
              <span className="dq-mono">{result.marketCount}</span> markets
            </>
          );
        })()
      : result.tier === "market"
      ? (
          <>
            <span className="dq-mono">{result.operatorCount}</span> operators
          </>
        )
      : (
          <>
            {result.marketCity}, {result.stateCode}
            {result.tier === "tracked" && (
              <>
                <span className="mx-1.5 text-muted-2">·</span>
                <span className="dq-mono">{result.t12Listings}</span> listings
                <span className="mx-1.5 text-muted-2">·</span>
                <span className="text-[11px] uppercase tracking-[0.06em] text-muted-2">
                  Tracked, no scorecard
                </span>
              </>
            )}
          </>
        );

  // richer-search — Fuse can match an operator row on an alias (DBA /
  // former name) rather than the primary `name`. Surface which alias
  // string matched so the user understands why an unfamiliar name showed
  // up. Market rows also carry `matchedAlias` (bare-city / state-name
  // aliases), but that's redundant there — the market's own city/state
  // subtitle already says the same thing — so the "also:" line is
  // suppressed for tier === "market". Not every tier carries the field
  // (tracked doesn't), so narrow via `in` rather than accessing it on the
  // raw union.
  const matchedAlias =
    result.tier !== "market" && "matchedAlias" in result
      ? result.matchedAlias
      : undefined;

  // v0.8 dormant tier — ranked and canonical rows both carry a status; the
  // tracked and market tiers have no such concept. Narrow via `in` so the
  // union stays honest rather than casting.
  const isDormant =
    (result.tier === "ranked" || result.tier === "canonical") &&
    result.status === "dormant";
  const dormantSince =
    isDormant && "lastListingDate" in result ? result.lastListingDate : null;

  const memberKey = operatorMemberKey(result);

  return (
    <li className="relative">
      <Link
        href={result.href}
        onClick={onSelect}
        className={
          `flex items-center justify-between gap-3 ${padding} transition-colors ` +
          (memberKey ? "pr-9 " : "") +
          (active
            ? "bg-surface-soft"
            : "hover:bg-surface-soft focus-visible:bg-surface-soft")
        }
        data-active={active || undefined}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`flex items-center gap-2 truncate font-medium leading-tight text-navy ${nameSize}`}
          >
            <span className="truncate">{result.name}</span>
            {result.tier === "canonical" && (
              <span className="shrink-0 rounded-full bg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-navy">
                Cross-market
              </span>
            )}
            {result.tier === "market" && (
              <span className="shrink-0 rounded-full bg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-navy">
                Market
              </span>
            )}
            {/* v0.8 dormant tier. The chip is what makes it safe to list a
                dormant operator beside ranked ones — without it the row reads
                as a claim they're currently active. Absent status = active, so
                a search index built before this field renders exactly as
                before rather than mislabelling anyone.

                Applies to canonical (multi-market) rows too. The builder sets
                their status only when EVERY market rolls up dormant, so this
                never labels an operator that is merely quiet in some of its
                markets — that is ordinary behaviour, not a whole-operator
                state. Without it the rollup row was the one place a fully
                quiet operator still read as active, and it is the row an
                owner is most likely to click. */}
            {isDormant && (
              <span className="shrink-0 rounded-full border border-[#F3D7B3] bg-orange-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-orange-700">
                Dormant
              </span>
            )}
          </p>
          <p
            className={`mt-0.5 truncate text-muted-foreground ${subSize}`}
          >
            {subtitle}
            {isDormant && dormantSince && (
              <>
                <span className="mx-1.5 text-muted-2">·</span>
                no listings since {fmtSearchDate(dormantSince)}
              </>
            )}
          </p>
          {matchedAlias && (
            <p className={`mt-0.5 truncate text-muted-2 ${subSize}`}>
              also: {matchedAlias}
            </p>
          )}
        </div>
        {(result.tier === "ranked" || result.tier === "canonical") && (
          <StarChip
            goldCount={result.goldCount}
            silverCount={result.silverCount}
          />
        )}
      </Link>
      {/* Sibling of the Link, not nested in it (same rationale as
          PMListItem) — absolutely positioned over the row's own right
          padding (reserved above via pr-9) so it doesn't collide with
          the star chip or the row's click-to-navigate area. */}
      {memberKey && (
        <div className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2">
          <AddToWatchList
            memberKey={memberKey}
            operatorName={result.name}
            compact
          />
        </div>
      )}
    </li>
  );
}
