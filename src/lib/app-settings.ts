import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SFR_TURNOVER_MULTIPLIER } from "@/lib/operator-size";

// Generic app-settings accessor backed by the AppSetting table. Consumers get
// a hardcoded default when a key has no row yet, so a fresh deploy (empty
// table) reads cleanly; the row is created on first admin edit.

export const SFR_TURNOVER_MULTIPLIER_KEY = "sfr_turnover_multiplier";

/**
 * SFR portfolio-size turnover multiplier (k in estimatedManagedUnits). Read
 * once per request (React cache dedupes across the many size call sites in a
 * single render). Falls back to the default when unset or invalid.
 */
export const getSfrTurnoverMultiplier = cache(async (): Promise<number> => {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: SFR_TURNOVER_MULTIPLIER_KEY },
    });
    const parsed = row ? Number(row.value) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_SFR_TURNOVER_MULTIPLIER;
  } catch {
    // Defensive: if the table doesn't exist yet (migration not applied), keep
    // rendering with the default rather than 500-ing the page.
    return DEFAULT_SFR_TURNOVER_MULTIPLIER;
  }
});

/** Persist the SFR turnover multiplier (admin server action). */
export async function setSfrTurnoverMultiplier(
  value: number,
  updatedBy: string
): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SFR_TURNOVER_MULTIPLIER_KEY },
    create: {
      key: SFR_TURNOVER_MULTIPLIER_KEY,
      value: String(value),
      type: "number",
      description:
        "SFR portfolio-size multiplier applied to urusT12 (turnover-adjusted managed-units estimate).",
      updatedBy,
    },
    update: { value: String(value), updatedBy },
  });
}
