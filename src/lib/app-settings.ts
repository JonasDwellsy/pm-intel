import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_K_HOUSE,
  DEFAULT_K_APT,
  type PortfolioMultipliers,
} from "@/lib/operator-size";

// Generic app-settings accessor backed by the AppSetting table. Consumers get
// hardcoded defaults when a key has no row yet, so a fresh deploy (empty table)
// reads cleanly; rows are created on first admin edit.

export const K_HOUSE_KEY = "portfolio_k_house";
export const K_APT_KEY = "portfolio_k_apt";

function parsePositive(value: string | undefined, fallback: number): number {
  const n = value != null ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Portfolio-size turnover multipliers (k_house, k_apt) used by
 * estimatedManagedUnits(). Read once per request (React cache dedupes across
 * the many size call sites in one render). Falls back to defaults when unset.
 */
export const getPortfolioMultipliers = cache(
  async (): Promise<PortfolioMultipliers> => {
    try {
      const rows = await prisma.appSetting.findMany({
        where: { key: { in: [K_HOUSE_KEY, K_APT_KEY] } },
      });
      const byKey = new Map(rows.map((r) => [r.key, r.value]));
      return {
        kHouse: parsePositive(byKey.get(K_HOUSE_KEY), DEFAULT_K_HOUSE),
        kApt: parsePositive(byKey.get(K_APT_KEY), DEFAULT_K_APT),
      };
    } catch {
      // Defensive: table missing (migration not yet applied) → defaults.
      return { kHouse: DEFAULT_K_HOUSE, kApt: DEFAULT_K_APT };
    }
  }
);

/** Persist the portfolio multipliers (admin server action). */
export async function setPortfolioMultipliers(
  { kHouse, kApt }: PortfolioMultipliers,
  updatedBy: string
): Promise<void> {
  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: K_HOUSE_KEY },
      create: {
        key: K_HOUSE_KEY,
        value: String(kHouse),
        type: "number",
        description: "Portfolio-size multiplier for scattered SFR (house) URUs.",
        updatedBy,
      },
      update: { value: String(kHouse), updatedBy },
    }),
    prisma.appSetting.upsert({
      where: { key: K_APT_KEY },
      create: {
        key: K_APT_KEY,
        value: String(kApt),
        type: "number",
        description: "Portfolio-size multiplier for apartment URUs.",
        updatedBy,
      },
      update: { value: String(kApt), updatedBy },
    }),
  ]);
}
