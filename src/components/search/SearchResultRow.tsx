"use client";

import Link from "next/link";
import type { PMSearchResult } from "@/lib/pm-search";

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

  return (
    <li>
      <Link
        href={result.href}
        onClick={onSelect}
        className={
          `flex items-center justify-between gap-3 ${padding} transition-colors ` +
          (active
            ? "bg-surface-soft"
            : "hover:bg-surface-soft focus-visible:bg-surface-soft")
        }
        data-active={active || undefined}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-medium leading-tight text-navy ${nameSize}`}
          >
            {result.name}
          </p>
          <p
            className={`mt-0.5 truncate text-muted-foreground ${subSize}`}
          >
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
          </p>
        </div>
        {result.tier === "ranked" && (
          <StarChip
            goldCount={result.goldCount}
            silverCount={result.silverCount}
          />
        )}
      </Link>
    </li>
  );
}
