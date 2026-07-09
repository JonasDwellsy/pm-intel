"use client";

import { useActionState, useState } from "react";
import {
  updatePortfolioMultipliers,
  type UpdateMultipliersState,
} from "@/app/admin/settings/actions";
import { estimatedManagedUnits } from "@/lib/operator-size";

// Sample (house, apt) observed splits for the live preview.
const PREVIEW: Array<{ label: string; house: number; apt: number }> = [
  { label: "Scattered SFR", house: 120, apt: 0 },
  { label: "Apartment operator", house: 0, apt: 3340 },
  { label: "Mixed (Fox-like)", house: 179, apt: 151 },
];

export function SizeSettingsForm({
  currentKHouse,
  currentKApt,
}: {
  currentKHouse: number;
  currentKApt: number;
}) {
  const [state, formAction, pending] = useActionState<
    UpdateMultipliersState,
    FormData
  >(updatePortfolioMultipliers, { ok: false });
  const [kHouse, setKHouse] = useState<number>(state.saved?.kHouse ?? currentKHouse);
  const [kApt, setKApt] = useState<number>(state.saved?.kApt ?? currentKApt);

  const mult = {
    kHouse: Number.isFinite(kHouse) && kHouse > 0 ? kHouse : 1,
    kApt: Number.isFinite(kApt) && kApt > 0 ? kApt : 1,
  };

  return (
    <form action={formAction} className="max-w-[620px]">
      <p className="mb-4 text-[12.5px] leading-[1.55] text-muted-foreground">
        Estimated managed units = houses observed (T12) × k_house + apartments
        observed (T12) × k_apt. Each unit uses its own type&rsquo;s turnover
        multiplier. Changes take effect across the site on next page load.
      </p>

      <div className="flex flex-wrap gap-6">
        <label className="block">
          <span className="block text-[13px] font-semibold text-navy">
            k_house <span className="font-normal text-muted-foreground">(SFR turnover)</span>
          </span>
          <input
            name="kHouse"
            type="number"
            step="0.1"
            min="0.1"
            max="20"
            required
            value={kHouse}
            onChange={(e) => setKHouse(Number(e.target.value))}
            className="mt-1 h-9 w-28 rounded-md border border-grid bg-white px-3 text-[14px] text-navy tabular-nums focus:border-navy focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-[13px] font-semibold text-navy">
            k_apt <span className="font-normal text-muted-foreground">(apartment turnover)</span>
          </span>
          <input
            name="kApt"
            type="number"
            step="0.1"
            min="0.1"
            max="20"
            required
            value={kApt}
            onChange={(e) => setKApt(Number(e.target.value))}
            className="mt-1 h-9 w-28 rounded-md border border-grid bg-white px-3 text-[14px] text-navy tabular-nums focus:border-navy focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-[26px] h-9 self-start rounded-md bg-navy px-4 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {state.ok && state.saved && (
        <p className="mt-2 text-[12.5px] font-medium text-good">
          Saved — k_house = {state.saved.kHouse}, k_apt = {state.saved.kApt}.
          Size updates across the site on next load.
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-[12.5px] font-medium text-orange">{state.error}</p>
      )}

      {/* Live preview */}
      <div className="mt-5 rounded-lg border border-grid bg-[#FAFAF8] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
          Preview — k_house = {mult.kHouse}, k_apt = {mult.kApt}
        </p>
        <table className="mt-2 w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 font-medium">Operator (observed house / apt)</th>
              <th className="pb-1 font-medium">→ Estimated managed units</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-navy">
            {PREVIEW.map((p) => (
              <tr key={p.label}>
                <td className="py-0.5">
                  {p.label} ({p.house}h / {p.apt}a)
                </td>
                <td className="py-0.5 font-medium">
                  ~
                  {estimatedManagedUnits(
                    { houseUrusT12: p.house, aptUrusT12: p.apt },
                    mult
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
