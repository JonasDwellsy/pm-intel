"use client";

import { useActionState, useState } from "react";
import {
  updateSfrMultiplier,
  type UpdateMultiplierState,
} from "@/app/admin/settings/actions";
import { estimatedManagedUnits } from "@/lib/operator-size";

// Sample observed-unit counts for the live preview (roughly the SFR p25 / median
// / p75 / p90 of urusT12), so the admin can see the multiplier's effect before
// saving.
const PREVIEW_URUS = [33, 51, 93, 179];

export function SizeSettingsForm({
  currentMultiplier,
}: {
  currentMultiplier: number;
}) {
  const [state, formAction, pending] = useActionState<
    UpdateMultiplierState,
    FormData
  >(updateSfrMultiplier, { ok: false });
  // Local value drives the live preview; defaults to the saved value (or the
  // last successfully-saved value after a submit).
  const [draft, setDraft] = useState<number>(
    state.savedValue ?? currentMultiplier
  );

  return (
    <form action={formAction} className="max-w-[560px]">
      <label
        htmlFor="multiplier"
        className="block text-[13px] font-semibold text-navy"
      >
        SFR turnover multiplier (k)
      </label>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">
        Estimated SFR managed units = observed units (T12) × k. Derived from the
        observed ~3.3-year SFR turnover cycle (a 12-month window sees ~1/k of the
        book). MF / community operators are unaffected — they use declared
        community units.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <input
          id="multiplier"
          name="multiplier"
          type="number"
          step="0.1"
          min="0.1"
          max="20"
          required
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          className="h-9 w-28 rounded-md border border-grid bg-white px-3 text-[14px] text-navy tabular-nums focus:border-navy focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-md bg-navy px-4 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {state.ok && (
        <p className="mt-2 text-[12.5px] font-medium text-good">
          Saved — k = {state.savedValue}. Size updates across the site on next
          load.
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-[12.5px] font-medium text-orange">
          {state.error}
        </p>
      )}

      {/* Live preview */}
      <div className="mt-5 rounded-lg border border-grid bg-[#FAFAF8] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
          Preview — SFR operators at k = {Number.isFinite(draft) ? draft : "—"}
        </p>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 font-medium">Observed units (T12)</th>
              <th className="pb-1 font-medium">→ Estimated managed units</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-navy">
            {PREVIEW_URUS.map((u) => (
              <tr key={u}>
                <td className="py-0.5">{u}</td>
                <td className="py-0.5 font-medium">
                  ~
                  {estimatedManagedUnits(
                    {
                      quadrant7Cell: "SFR Independent",
                      urusT12: u,
                      observedCommunityTotalUnits: null,
                    },
                    Number.isFinite(draft) && draft > 0 ? draft : 1
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
