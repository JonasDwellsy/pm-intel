"use server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseCadence } from "@/lib/watch-list/digest-gather";

export async function updateDigestPreference(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;
  const subscribed = formData.get("subscribed") === "on";
  const cadence = parseCadence(formData.get("cadence")) ?? "monthly";
  await prisma.digestPreference.upsert({
    where: { userId },
    update: { unsubscribed: !subscribed, cadence },
    create: { userId, unsubscribed: !subscribed, cadence },
  });
  revalidatePath("/settings/notifications");
}
