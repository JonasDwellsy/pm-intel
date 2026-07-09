// Admin → Settings. Methodology knobs backed by the AppSetting table.
// Portfolio-size multipliers k_house / k_apt feed estimatePortfolioSize(),
// which runs in seed.ts — so a change takes effect on the NEXT DEPLOY (re-seed
// with FORCE_SEED), not live. The size is a single seeded value read by every
// surface (scorecard, market pages, watch-lists, AI, briefs, home).
//
// Auth: gated by src/app/admin/layout.tsx.

import type { Metadata } from "next";
import { getPortfolioMultipliers } from "@/lib/app-settings";
import { DEFAULT_K_HOUSE, DEFAULT_K_APT } from "@/lib/operator-size";
import { SizeSettingsForm } from "@/components/admin/SizeSettingsForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // robots noindex inherited from src/app/admin/layout.tsx
  title: "Admin · Settings",
};

export default async function AdminSettingsPage() {
  const { kHouse, kApt } = await getPortfolioMultipliers();

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-12">
      <header className="mb-6 mt-6">
        <h1 className="text-[22px] font-semibold text-navy">Settings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Methodology parameters, stored in the database. Portfolio-size
          multipliers are applied at seed time, so a change takes effect on the
          next deploy (re-seed).
        </p>
      </header>

      <section className="rounded-xl border border-grid bg-white p-6">
        <h2 className="text-[15px] font-semibold text-navy">
          Portfolio-size estimation
        </h2>
        <p className="mt-1 mb-4 text-[12.5px] leading-[1.55] text-muted-foreground">
          Operator size is an estimated managed-unit count, built from on-market
          turnover split by unit type:{" "}
          <span className="font-medium text-navy">
            houses (T12) × k_house + apartments (T12) × k_apt
          </span>
          . Defaults: k_house{" "}
          <span className="dq-mono font-medium text-navy">{DEFAULT_K_HOUSE}</span>{" "}
          (scattered SFR re-lists ~every 3.3y), k_apt{" "}
          <span className="dq-mono font-medium text-navy">{DEFAULT_K_APT}</span>{" "}
          (apartments turn over faster). Applied uniformly to every operator.
        </p>
        <SizeSettingsForm currentKHouse={kHouse} currentKApt={kApt} />
      </section>
    </div>
  );
}
