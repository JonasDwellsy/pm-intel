"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { setSfrTurnoverMultiplier } from "@/lib/app-settings";

export interface UpdateMultiplierState {
  ok: boolean;
  error?: string;
  savedValue?: number;
}

// Server action (useActionState signature). Admin-gated defensively even
// though src/app/admin/layout.tsx already gates the route.
export async function updateSfrMultiplier(
  _prev: UpdateMultiplierState,
  formData: FormData
): Promise<UpdateMultiplierState> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return { ok: false, error: "Not authorized." };
  }
  const value = Number(formData.get("multiplier"));
  if (!Number.isFinite(value) || value <= 0 || value > 20) {
    return { ok: false, error: "Enter a multiplier between 0 and 20." };
  }
  await setSfrTurnoverMultiplier(value, userId);
  // Size renders across the market + operator surfaces; bust their caches so
  // the new multiplier shows immediately.
  revalidatePath("/admin/settings");
  revalidatePath("/property-managers", "layout");
  revalidatePath("/operators", "layout");
  return { ok: true, savedValue: value };
}
