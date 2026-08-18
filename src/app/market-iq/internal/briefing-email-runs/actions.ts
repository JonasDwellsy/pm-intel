"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { isAdminUser } from "@/lib/auth/is-admin";
import { runMarketIqInternalBriefingDryRun } from "@/lib/market-iq/briefing-email-orchestrator.server";
import { marketIqPreviewEnabled } from "@/lib/market-iq/feature";

export async function runMarketIqBriefingEligibilityCheck() {
  const { userId } = await getActiveOrgContext();
  if (!marketIqPreviewEnabled() || !isAdminUser(userId)) {
    return { ok: false, error: "Not found." };
  }
  try {
    const run = await runMarketIqInternalBriefingDryRun({ triggerKind: "manual" });
    revalidatePath("/market-iq/internal/briefing-email-runs");
    return { ok: true, runId: run.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
