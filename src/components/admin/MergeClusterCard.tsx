"use client";

// v0.23 — one candidate merge cluster in the admin merge tool. Human picks the
// surviving operator + confirms the canonical name, then Merge or Dismiss.
// Decisions are queued (recorded in the DB) and applied later by the offline
// pipeline — nothing merges live.
//
// v0.6.5 — per-member selection. The token-matcher sometimes clusters a real
// operator's variants together with a false positive that merely shares tokens
// (e.g. "Pure … Orange County Office" grouped with the independent "Orange
// County Property Management"). Each member now has an include checkbox:
// unchecked records are left OUT of the merge (they stay as separate
// operators). Only the checked members are submitted as memberSlugs — the
// server action already merges exactly the submitted subset — and the survivor
// must be one of them.

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  decideCluster,
  type MergeDecisionResult,
} from "@/app/admin/merges/actions";
import type { MergeCluster } from "@/lib/operators/merge-candidates";

function DecisionButton({
  decision,
  label,
  pendingLabel,
  className,
  disabled,
}: {
  decision: "merge" | "dismiss";
  label: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={pending || disabled}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function MergeClusterCard({
  marketId,
  cluster,
}: {
  marketId: string;
  cluster: MergeCluster;
}) {
  const [survivor, setSurvivor] = useState(cluster.survivorSlugSuggestion);
  const [canonical, setCanonical] = useState(cluster.canonicalNameSuggestion);
  // All members included by default; unchecking excludes a record from the
  // merge (it stays a separate operator).
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(cluster.members.map((m) => m.slug))
  );
  const [state, formAction] = useActionState<
    MergeDecisionResult | null,
    FormData
  >(decideCluster, null);

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-good/40 bg-good/5 px-4 py-3 text-[13px] text-good">
        ✓ {state.summary}
      </div>
    );
  }

  function toggle(slug: string) {
    const next = new Set(included);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setIncluded(next);
    // If the survivor was just excluded, move it to the first remaining
    // included member so the radio never points at an excluded record.
    if (slug === survivor && !next.has(slug)) {
      const firstIncluded = cluster.members.find((m) => next.has(m.slug));
      setSurvivor(firstIncluded ? firstIncluded.slug : "");
    }
  }

  const includedMembers = cluster.members.filter((m) => included.has(m.slug));
  const excludedCount = cluster.members.length - includedMembers.length;
  const combinedT12 = includedMembers.reduce((s, m) => s + m.listings, 0);
  const nameMatches = canonical.trim().length > 0;
  const canMerge =
    nameMatches && includedMembers.length >= 2 && included.has(survivor);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-grid bg-white p-4"
    >
      <input type="hidden" name="marketId" value={marketId} />
      <input type="hidden" name="clusterKey" value={cluster.clusterKey} />
      {/* Only INCLUDED members are submitted — the action merges exactly this
          subset; unchecked records are left as separate operators. */}
      {includedMembers.map((m) => (
        <input key={m.slug} type="hidden" name="memberSlugs" value={m.slug} />
      ))}

      <div className="mb-3 flex items-center gap-2">
        <span
          className={
            cluster.tier === "exact"
              ? "rounded-full bg-navy px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
              : "rounded-full border border-grid px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-grey-600"
          }
        >
          {cluster.tier === "exact" ? "Exact match" : "Possible"}
        </span>
        <span className="text-[12px] text-grey-500">
          {includedMembers.length} of {cluster.members.length} records ·{" "}
          {combinedT12} T12 combined
          {excludedCount > 0 && (
            <span className="text-grey-400">
              {" "}
              · {excludedCount} excluded
            </span>
          )}
        </span>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-wider text-grey-600 mb-1">
        Canonical name
      </label>
      <input
        name="canonicalName"
        value={canonical}
        onChange={(e) => setCanonical(e.target.value)}
        className="mb-3 w-full max-w-[420px] rounded-md border border-grid bg-white px-3 py-2 text-[14px] text-navy focus:outline-none focus:ring-2 focus:ring-teal-500"
      />

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-grey-600">
        Members · include the ones that are the same operator, pick the survivor
      </p>
      <ul className="mb-4 divide-y divide-grid border-y border-grid">
        {cluster.members.map((m) => {
          const isIncluded = included.has(m.slug);
          return (
            <li
              key={m.slug}
              className={`flex items-center gap-3 py-2 text-[13.5px] ${
                isIncluded ? "" : "opacity-45"
              }`}
            >
              <input
                type="checkbox"
                checked={isIncluded}
                onChange={() => toggle(m.slug)}
                className="shrink-0"
                aria-label={`Include ${m.name} in the merge`}
              />
              <input
                type="radio"
                name="survivorSlug"
                value={m.slug}
                checked={survivor === m.slug}
                disabled={!isIncluded}
                onChange={() => setSurvivor(m.slug)}
                className="shrink-0 disabled:opacity-30"
                aria-label={`Make ${m.name} the survivor`}
              />
              <span className="min-w-0 flex-1 truncate text-navy">{m.name}</span>
              {m.companyId && (
                <a
                  href={`https://dwellsy.com/company/${m.companyId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11.5px] font-medium text-teal-700 hover:underline"
                  title="Open this operator's Dwellsy company page"
                >
                  Dwellsy ↗
                </a>
              )}
              {m.eligible ? (
                m.quadrant7Cell && (
                  <span className="shrink-0 text-[11.5px] text-grey-500">
                    {m.quadrant7Cell}
                  </span>
                )
              ) : (
                <span
                  className="shrink-0 rounded-full border border-grid px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-grey-500"
                  title="Below the ranking cutoff — surfaced only so it can be merged into the operator above"
                >
                  not yet ranked
                </span>
              )}
              <span className="shrink-0 dq-tnum text-[12.5px] text-grey-600">
                {m.listings} T12
              </span>
              {m.claimed && (
                <span className="shrink-0 text-[11px] font-semibold text-good">
                  claimed
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <DecisionButton
          decision="merge"
          label="Merge"
          pendingLabel="Saving…"
          disabled={!canMerge}
          className="rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-700"
        />
        <DecisionButton
          decision="dismiss"
          label="Not a merge"
          pendingLabel="Saving…"
          className="rounded-md px-3 py-2 text-[13px] font-semibold text-grey-600 hover:text-navy"
        />
        {state && !state.ok && state.error && (
          <span className="text-[13px] text-red-700">{state.error}</span>
        )}
      </div>
    </form>
  );
}
