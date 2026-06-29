"use client";

// v0.22 — provision an organization's market access. Mirrors the
// InviteUserForm useActionState pattern. Selection is controlled React
// state; the "All markets (current + future)" toggle disables the
// per-market checklist (the flag alone is the entitlement). On save the
// checked market ids submit as a `marketIds` checkbox group.

import { useFormStatus } from "react-dom";
import { useActionState, useMemo, useState } from "react";
import {
  setOrganizationMarketAccess,
  type SetMarketAccessResult,
} from "@/app/admin/organizations/actions";

export interface MarketAccessGroup {
  stateLabel: string;
  markets: Array<{ id: string; label: string }>;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-navy px-4 py-2 text-[13px] font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save market access"}
    </button>
  );
}

export function MarketAccessForm({
  orgId,
  initialAllMarkets,
  initialSelectedIds,
  groups,
  totalMarkets,
}: {
  orgId: string;
  initialAllMarkets: boolean;
  initialSelectedIds: string[];
  groups: MarketAccessGroup[];
  totalMarkets: number;
}) {
  const [state, formAction] = useActionState<
    SetMarketAccessResult | null,
    FormData
  >(setOrganizationMarketAccess, null);

  const [allMarkets, setAllMarkets] = useState(initialAllMarkets);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds)
  );

  const allIds = useMemo(
    () => groups.flatMap((g) => g.markets.map((m) => m.id)),
    [groups]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCount = selected.size;

  return (
    <form action={formAction} className="rounded-md border border-grid bg-surface-soft p-4">
      <input type="hidden" name="orgId" value={orgId} />

      {/* All-markets toggle */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="allMarkets"
          checked={allMarkets}
          onChange={(e) => setAllMarkets(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-grid text-navy focus:ring-teal-500"
        />
        <span>
          <span className="block text-[14px] font-semibold text-navy">
            All markets (current &amp; future)
          </span>
          <span className="block text-[12px] text-grey-600">
            Entitles this org to every market we have now and any we launch
            later — no need to re-provision. Use for internal / comp accounts
            and national-tier clients.
          </span>
        </span>
      </label>

      {/* Per-market checklist — hidden/disabled when all-markets is on */}
      <div
        className={
          "mt-4 border-t border-grid pt-4 " +
          (allMarkets ? "opacity-40 pointer-events-none select-none" : "")
        }
        aria-hidden={allMarkets}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-grey-600">
            {allMarkets
              ? "All markets selected"
              : `${selectedCount} of ${totalMarkets} markets selected`}
          </span>
          <span className="flex gap-3 text-[12px]">
            <button
              type="button"
              onClick={() => setSelected(new Set(allIds))}
              disabled={allMarkets}
              className="font-semibold text-teal hover:text-teal-700 disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={allMarkets}
              className="font-semibold text-grey-600 hover:text-navy disabled:opacity-50"
            >
              Clear
            </button>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.stateLabel}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-grey-500">
                {g.stateLabel}
              </p>
              <ul className="space-y-1">
                {g.markets.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2 text-[13.5px] text-navy cursor-pointer">
                      <input
                        type="checkbox"
                        name="marketIds"
                        value={m.id}
                        checked={selected.has(m.id)}
                        onChange={() => toggle(m.id)}
                        className="h-4 w-4 rounded border-grid text-navy focus:ring-teal-500"
                      />
                      {m.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-grid pt-4">
        <SaveButton />
        {state?.ok && state.summary && (
          <span className="text-[13px] text-good">
            Saved — this org now has {state.summary}.
          </span>
        )}
        {state && !state.ok && state.error && (
          <span className="text-[13px] text-red-700">{state.error}</span>
        )}
      </div>
    </form>
  );
}
