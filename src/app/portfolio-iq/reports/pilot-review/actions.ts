"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveOrgContext } from "@/lib/auth/active-org";
import { finalizePilotValueReview } from "@/lib/portfolio-iq/pilot-value-review.server";

export async function lockPilotValueReview(): Promise<void> {
  const { userId, organizationId } = await getActiveOrgContext();
  if (!userId || !organizationId) throw new Error("Workspace not ready.");
  const review = await finalizePilotValueReview({ userId, organizationId });
  revalidatePath("/portfolio-iq/reports/pilot-review");
  redirect(`/portfolio-iq/reports/pilot-review?review=${encodeURIComponent(review.id)}&locked=1`);
}
