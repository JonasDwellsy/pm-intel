"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isAdminUser } from "@/lib/auth/is-admin";
import { setPortfolioMultipliers } from "@/lib/app-settings";

export interface UpdateMultipliersState {
  ok: boolean;
  error?: string;
  saved?: { kHouse: number; kApt: number };
}

// Server action (useActionState signature). Admin-gated defensively even
// though src/app/admin/layout.tsx already gates the route.
export async function updatePortfolioMultipliers(
  _prev: UpdateMultipliersState,
  formData: FormData
): Promise<UpdateMultipliersState> {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return { ok: false, error: "Not authorized." };
  }
  const kHouse = Number(formData.get("kHouse"));
  const kApt = Number(formData.get("kApt"));
  const valid = (n: number) => Number.isFinite(n) && n > 0 && n <= 20;
  if (!valid(kHouse) || !valid(kApt)) {
    return { ok: false, error: "Enter multipliers between 0 and 20." };
  }
  await setPortfolioMultipliers({ kHouse, kApt }, userId);
  // Size renders across the market + operator surfaces; bust their caches so
  // the new multipliers show immediately.
  revalidatePath("/admin/settings");
  revalidatePath("/property-managers", "layout");
  revalidatePath("/operators", "layout");
  return { ok: true, saved: { kHouse, kApt } };
}
