// Admin → Settings. Methodology knobs editable at runtime (backed by the
// AppSetting table). First knob: the SFR turnover multiplier used by
// estimatedManagedUnits(). Changing it takes effect on next page load across
// the market + operator surfaces — no pipeline refresh needed, because size is
// computed at read time from the raw observed counts already in the seed.
//
// Auth: gated by src/app/admin/layout.tsx.

import type { Metadata } from "next";
import { getSfrTurnoverMultiplier } from "@/lib/app-settings";
import { DEFAULT_SFR_TURNOVER_MULTIPLIER } from "@/lib/operator-size";
import { SizeSettingsForm } from "@/components/admin/SizeSettingsForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // robots noindex inherited from src/app/admin/layout.tsx
  title: "Admin · Settings",
};

export default async function AdminSettingsPage() {
  const currentMultiplier = await getSfrTurnoverMultiplier();

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-12">
      <header className="mb-6 mt-6">
        <h1 className="text-[22px] font-semibold text-navy">Settings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Methodology parameters. Changes are stored in the database and take
          effect on the next page load — no data refresh required.
        </p>
      </header>

      <section className="rounded-xl border border-grid bg-white p-6">
        <h2 className="text-[15px] font-semibold text-navy">
          Portfolio-size estimation
        </h2>
        <p className="mt-1 mb-4 text-[12.5px] leading-[1.55] text-muted-foreground">
          Operator size is shown as an estimated managed-unit count. Multi-unit
          (MF/BTR, Hybrid) operators use their declared community unit totals.
          Scattered SFR operators use a turnover-adjusted estimate:{" "}
          <span className="font-medium text-navy">
            observed units (T12) × k
          </span>
          . The default k is{" "}
          <span className="dq-mono font-medium text-navy">
            {DEFAULT_SFR_TURNOVER_MULTIPLIER}
          </span>
          , derived from the observed ~3.3-year SFR turnover cycle.
        </p>
        <SizeSettingsForm currentMultiplier={currentMultiplier} />
      </section>
    </div>
  );
}
