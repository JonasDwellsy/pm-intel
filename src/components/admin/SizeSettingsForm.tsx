"use client";

import { useActionState, useEffect, useState } from "react";
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
  // Two-step confirm: Save arms the confirmation; a second click applies.
  const [confirming, setConfirming] = useState(false);

  // Drop out of the armed state once a save lands, so the confirm UI doesn't
  // linger after success.
  useEffect(() => {
    if (state.ok) setConfirming(false);
  }, [state.ok]);

  const inRange = (v: number) => Number.isFinite(v) && v >= 0.1 && v <= 20;
  const valid = inRange(kHouse) && inRange(kApt);

  const mult = {
    kHouse: Number.isFinite(kHouse) && kHouse > 0 ? kHouse : 1,
    kApt: Number.isFinite(kApt) && kApt > 0 ? kApt : 1,
  };

  return (
    <form action={formAction} className="max-w-[620px]">
      <p className="mb-4 text-[12.5px] leading-[1.55] text-muted-foreground">
        Estimated managed units = houses observed (T12) × k_house + apartments
        observed (T12) × k_apt. Each unit uses its own type&rsquo;s turnover
        multiplier. Applied at seed time — changes take effect on the next
        deploy (re-seed).
      </p>

      {/* Danger zone — this multiplier re-scales EVERY operator's size. */}
      <div className="rounded-lg border border-[#e0b4b4] bg-[#fdf5f5] p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#b23b3b]">
          <span aria-hidden>⚠</span> Danger zone
        </p>
        <p className="mt-1 text-[12px] leading-[1.5] text-[#8a4b4b]">
          Changing these re-scales <strong>every operator&rsquo;s</strong>{" "}
          estimated size. It moves the size shown on public scorecards, market
          rankings, watch-list thresholds, and AI answers. Not instant — it
          applies on the next deploy (re-seed).
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-6">
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
              onChange={(e) => {
                setKHouse(Number(e.target.value));
                setConfirming(false); // editing a value invalidates a pending confirm
              }}
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
              onChange={(e) => {
                setKApt(Number(e.target.value));
                setConfirming(false);
              }}
              className="mt-1 h-9 w-28 rounded-md border border-grid bg-white px-3 text-[14px] text-navy tabular-nums focus:border-navy focus:outline-none"
            />
          </label>

          {!confirming && (
            <button
              type="button"
              disabled={!valid}
              onClick={() => setConfirming(true)}
              className="h-9 self-end rounded-md bg-navy px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Save changes
            </button>
          )}
        </div>

        {/* Second step: explicit confirmation of the re-scale. */}
        {confirming && (
          <div className="mt-3 rounded-md border border-[#d64545] bg-white p-3">
            <p className="text-[12.5px] leading-[1.5] text-[#8a4b4b]">
              Re-scale <strong>every operator</strong> to{" "}
              <span className="tabular-nums font-semibold text-navy">
                k_house = {kHouse}, k_apt = {kApt}
              </span>
              ? This changes the estimated size across the platform on the next
              deploy.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="h-9 rounded-md bg-[#c0392b] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Saving…" : "Confirm re-scale"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(false)}
                className="h-9 rounded-md border border-grid bg-white px-4 text-[13px] font-semibold text-navy disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {state.ok && state.saved && (
          <p className="mt-2 text-[12.5px] font-medium text-good">
            Saved — k_house = {state.saved.kHouse}, k_apt = {state.saved.kApt}.
            Takes effect on the next deploy (re-seed).
          </p>
        )}
        {state.error && (
          <p className="mt-2 text-[12.5px] font-medium text-orange">{state.error}</p>
        )}
      </div>

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
